import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "./index";
import { type TeamChannel, teamChannels } from "./team-channel";
import { MAX_WEBHOOK_AGE_MS, MAX_WEBHOOK_BYTES, sign, signedBy } from "./webhooks";

const SECRET = env.LINEAR_WEBHOOK_SECRET;
const WEBHOOK_URL = "https://linear-weather.example/webhooks/linear";

/** Listens on teams' channels, counting what each hears. */
async function listenOn(...teamIds: string[]) {
  const heard = new Map(teamIds.map((id) => [id, 0]));
  const stops = await Promise.all(
    teamIds.map((teamId) =>
      teamChannels(env.TEAM_CHANNELS).listen(teamId, {
        changed: () => {
          heard.set(teamId, (heard.get(teamId) ?? 0) + 1);
        },
        lost: () => {},
      }),
    ),
  );
  stopAll.push(...stops);
  return heard;
}
const stopAll: (() => void)[] = [];
afterEach(() => {
  for (const stop of stopAll.splice(0)) stop();
});

/**
 * The TEAM_CHANNELS namespace, noting each team whose channel is asked for. The handler awaits
 * its publishes, so once a delivery is answered this says exactly who was told; what listeners
 * hear arrives later, and can't show that nobody was.
 */
function recordingChannels() {
  const told: string[] = [];
  const namespace = {
    idFromName(name: string) {
      told.push(name);
      return env.TEAM_CHANNELS.idFromName(name);
    },
    get: (id: DurableObjectId) => env.TEAM_CHANNELS.get(id),
  } as unknown as DurableObjectNamespace<TeamChannel>;
  return { told, namespace };
}

/** Delivers a webhook as Linear would, signed with `secret`; its status and who was told. */
async function deliver(
  payload: object,
  { secret = SECRET, signature }: { secret?: string; signature?: string } = {},
) {
  const body = JSON.stringify({ webhookTimestamp: Date.now(), ...payload });
  return deliverBody(body, signature ?? (await sign(secret, body)));
}

/** Delivers `body` as it is, under `signature`, to a server with `envChanges`; its status and who was told. */
async function deliverBody(body: string, signature: string, envChanges: Partial<Env> = {}) {
  const channels = recordingChannels();
  const res = await app.request(
    WEBHOOK_URL,
    {
      method: "POST",
      headers: { "content-type": "application/json", "linear-signature": signature },
      body,
    },
    { ...env, TEAM_CHANNELS: channels.namespace, ...envChanges },
  );
  return { status: res.status, told: channels.told };
}

const issueUpdated = (teamId: string, updatedFrom: object = {}) => ({
  action: "update",
  type: "Issue",
  data: { id: "issue-1", teamId, dueDate: "2026-11-20" },
  updatedFrom: { dueDate: null, ...updatedFrom },
});

describe("POST /webhooks/linear", () => {
  it("tells the issue's team's boards it changed", async () => {
    const heard = await listenOn("team-a");
    const { status, told } = await deliver(issueUpdated("team-a"));
    expect(status).toBe(204);
    expect(told).toEqual(["team-a"]);
    await vi.waitFor(() => expect(heard.get("team-a")).toBe(1));
  });

  it("tells both teams when an issue moves between them", async () => {
    const heard = await listenOn("team-a", "team-b");
    const { told } = await deliver(issueUpdated("team-b", { teamId: "team-a" }));
    expect(told.sort()).toEqual(["team-a", "team-b"]);
    await vi.waitFor(() => {
      expect(heard.get("team-a")).toBe(1);
      expect(heard.get("team-b")).toBe(1);
    });
  });

  it("tells the team when its cycle changes", async () => {
    const heard = await listenOn("team-a");
    const { told } = await deliver({
      action: "update",
      type: "Cycle",
      data: { id: "cycle-1", teamId: "team-a" },
    });
    expect(told).toEqual(["team-a"]);
    await vi.waitFor(() => expect(heard.get("team-a")).toBe(1));
  });

  it("takes changes boards don't show without telling anyone", async () => {
    const { status, told } = await deliver({
      action: "create",
      type: "Comment",
      data: { teamId: "team-a" },
    });
    expect(status).toBe(204);
    expect(told).toEqual([]);
  });

  it("refuses a delivery signed with another secret, or not signed", async () => {
    for (const options of [{ secret: "not-ours" }, { signature: "" }, { signature: "zz" }]) {
      const { status, told } = await deliver(issueUpdated("team-a"), options);
      expect(status).toBe(401);
      expect(told).toEqual([]);
    }
  });

  it("refuses a delivery older than a minute, which could be a replay", async () => {
    const { status, told } = await deliver({
      ...issueUpdated("team-a"),
      webhookTimestamp: Date.now() - MAX_WEBHOOK_AGE_MS - 1_000,
    });
    expect(status).toBe(400);
    expect(told).toEqual([]);
  });

  it("refuses a signed body that isn't a JSON object", async () => {
    for (const body of ["null", "[]", "42", "not json"]) {
      const { status, told } = await deliverBody(body, await sign(SECRET, body));
      expect(status).toBe(400);
      expect(told).toEqual([]);
    }
  });

  it("refuses everything while no signing secret is set", async () => {
    const body = JSON.stringify({ webhookTimestamp: Date.now(), ...issueUpdated("team-a") });
    const { status, told } = await deliverBody(body, await sign("any", body), {
      LINEAR_WEBHOOK_SECRET: "",
    });
    expect(status).toBe(401);
    expect(told).toEqual([]);
  });

  it("refuses a body too large to be Linear's before checking it", async () => {
    const body = JSON.stringify({
      webhookTimestamp: Date.now(),
      ...issueUpdated("team-a"),
      padding: "x".repeat(MAX_WEBHOOK_BYTES),
    });
    const { status, told } = await deliverBody(body, await sign(SECRET, body));
    expect(status).toBe(413);
    expect(told).toEqual([]);
  });

  it("doesn't tell anyone about an issue's edits boards don't show", async () => {
    const { status, told } = await deliver({
      ...issueUpdated("team-a"),
      updatedFrom: { description: "Before", updatedAt: "2026-11-19T10:00:00.000Z" },
    });
    expect(status).toBe(204);
    expect(told).toEqual([]);
  });

  it("tells the team about an update that doesn't say what changed", async () => {
    const { updatedFrom: _, ...update } = issueUpdated("team-a");
    const { told } = await deliver(update);
    expect(told).toEqual(["team-a"]);
  });

  it("takes a delivery whose team can't be told, since a retry would come too late", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const unreachable = {
      idFromName: (name: string) => env.TEAM_CHANNELS.idFromName(name),
      get: () => ({ publish: () => Promise.reject(new Error("Channel down")) }),
    } as unknown as DurableObjectNamespace<TeamChannel>;
    const body = JSON.stringify({ webhookTimestamp: Date.now(), ...issueUpdated("team-a") });
    const { status } = await deliverBody(body, await sign(SECRET, body), {
      TEAM_CHANNELS: unreachable,
    });
    expect(status).toBe(204);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("team-a"));
    error.mockRestore();
  });
});

describe("teamChannels().listen", () => {
  it("can be stopped more than once", async () => {
    const stop = await teamChannels(env.TEAM_CHANNELS).listen("team-a", {
      changed: () => {},
      lost: () => {},
    });
    stop();
    expect(() => stop()).not.toThrow();
  });

  it("says once that it lost the channel when the channel closes", async () => {
    // A channel whose end of the socket the test holds, to close it.
    let channelEnd: WebSocket | undefined;
    const namespace = {
      idFromName: (name: string) => env.TEAM_CHANNELS.idFromName(name),
      get: () => ({
        async fetch() {
          const pair = new WebSocketPair();
          channelEnd = pair[1];
          channelEnd.accept();
          return new Response(null, { status: 101, webSocket: pair[0] });
        },
      }),
    } as unknown as DurableObjectNamespace<TeamChannel>;
    let lost = 0;
    const stop = await teamChannels(namespace).listen("team-a", {
      changed: () => {},
      lost: () => {
        lost++;
      },
    });
    stopAll.push(stop);
    channelEnd?.close(1011, "Restarting");
    await vi.waitFor(() => expect(lost).toBe(1));
    stop();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lost).toBe(1);
  });

  it("hears nothing once stopped, nor says it lost the channel", async () => {
    const teamId = "team-stopped";
    let changed = 0;
    let lost = 0;
    const channels = teamChannels(env.TEAM_CHANNELS);
    const stop = await channels.listen(teamId, {
      changed: () => {
        changed++;
      },
      lost: () => {
        lost++;
      },
    });
    stop();
    await channels.publish(teamId);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect({ changed, lost }).toEqual({ changed: 0, lost: 0 });
  });
});

describe("signedBy", () => {
  it("accepts the body's HMAC-SHA256 in hex, either case", async () => {
    const signature = await sign("secret", "body");
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(await signedBy("secret", "body", signature)).toBe(true);
    expect(await signedBy("secret", "body", signature.toUpperCase())).toBe(true);
    expect(await signedBy("secret", "body!", signature)).toBe(false);
  });
});
