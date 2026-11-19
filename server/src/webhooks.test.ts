import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "./index";
import { teamChannels } from "./team-channel";
import { MAX_WEBHOOK_AGE_MS, sign, signedBy } from "./webhooks";

const SECRET = env.LINEAR_WEBHOOK_SECRET;

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

/** Delivers a webhook as Linear would, signed with `secret`. */
async function deliver(
  payload: object,
  { secret = SECRET, signature = undefined as string | undefined } = {},
) {
  const body = JSON.stringify({ webhookTimestamp: Date.now(), ...payload });
  return app.request(
    "https://linear-weather.example/webhooks/linear",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "linear-signature": signature ?? (await sign(secret, body)),
      },
      body,
    },
    env,
  );
}

const issueUpdated = (teamId: string, updatedFrom: object = {}) => ({
  action: "update",
  type: "Issue",
  data: { id: "issue-1", teamId, dueDate: "2026-11-20" },
  updatedFrom: { dueDate: null, ...updatedFrom },
});

describe("POST /webhooks/linear", () => {
  it("tells the issue's team's boards it changed", async () => {
    const heard = await listenOn("team-a", "team-b");
    const res = await deliver(issueUpdated("team-a"));
    expect(res.status).toBe(204);
    await vi.waitFor(() => expect(heard.get("team-a")).toBe(1));
    expect(heard.get("team-b")).toBe(0);
  });

  it("tells both teams when an issue moves between them", async () => {
    const heard = await listenOn("team-a", "team-b");
    await deliver(issueUpdated("team-b", { teamId: "team-a" }));
    await vi.waitFor(() => {
      expect(heard.get("team-a")).toBe(1);
      expect(heard.get("team-b")).toBe(1);
    });
  });

  it("tells the team when its cycle changes", async () => {
    const heard = await listenOn("team-a");
    await deliver({ action: "update", type: "Cycle", data: { id: "cycle-1", teamId: "team-a" } });
    await vi.waitFor(() => expect(heard.get("team-a")).toBe(1));
  });

  it("takes changes boards don't show without telling anyone", async () => {
    const heard = await listenOn("team-a");
    const res = await deliver({ action: "create", type: "Comment", data: { teamId: "team-a" } });
    expect(res.status).toBe(204);
    // A later change arrives on its own, so the comment never did.
    await deliver(issueUpdated("team-a"));
    await vi.waitFor(() => expect(heard.get("team-a")).toBe(1));
  });

  it("refuses a delivery signed with another secret, or not signed", async () => {
    const heard = await listenOn("team-a");
    expect((await deliver(issueUpdated("team-a"), { secret: "not-ours" })).status).toBe(401);
    expect((await deliver(issueUpdated("team-a"), { signature: "" })).status).toBe(401);
    expect((await deliver(issueUpdated("team-a"), { signature: "zz" })).status).toBe(401);
    expect(heard.get("team-a")).toBe(0);
  });

  it("refuses a delivery older than a minute, which could be a replay", async () => {
    const res = await deliver({
      ...issueUpdated("team-a"),
      webhookTimestamp: Date.now() - MAX_WEBHOOK_AGE_MS - 1_000,
    });
    expect(res.status).toBe(400);
  });

  it("refuses everything while no signing secret is set", async () => {
    const res = await app.request(
      "https://linear-weather.example/webhooks/linear",
      { method: "POST", headers: { "linear-signature": await sign("any", "{}") }, body: "{}" },
      { ...env, LINEAR_WEBHOOK_SECRET: "" },
    );
    expect(res.status).toBe(401);
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
