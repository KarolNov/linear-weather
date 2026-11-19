// Linear's webhooks: an issue was created, updated (reassigned, its due date changed, …) or
// removed. Each is checked against the signing secret, then the team it touched (both teams,
// for an issue that moved) hears it changed, so its open boards read it again.

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { teamChannels } from "./team-channel";

/** How old a delivery may be, as Linear recommends, so a captured one can't be replayed later. */
export const MAX_WEBHOOK_AGE_MS = 60_000;

/**
 * The largest body read before its signature is checked. Linear's payloads are a few KB (an
 * issue's description is the bulk), so anything near this isn't Linear's, and needn't be hashed.
 */
export const MAX_WEBHOOK_BYTES = 1024 * 1024;

/** The kinds of change that can move what a board shows. Cycles decide what's in the current one. */
const BOARD_EVENTS = new Set(["Issue", "Cycle"]);

/**
 * An issue's fields that a board shows or places it by (see linear/*.graphql). An update that
 * changes none of them, such as a description being typed, doesn't make every open board read
 * its team again.
 */
const BOARD_ISSUE_FIELDS = new Set([
  "title",
  "number",
  "dueDate",
  "priority",
  "estimate",
  "assigneeId",
  "stateId",
  "teamId",
  "cycleId",
  "archivedAt",
  "trashed",
]);

interface WebhookPayload {
  type?: unknown;
  action?: unknown;
  webhookTimestamp?: unknown;
  data?: { teamId?: unknown };
  /** The changed fields' earlier values: `teamId` when an issue moved team. */
  updatedFrom?: { teamId?: unknown };
}

export const webhooks = new Hono<{ Bindings: Env }>().post(
  "/linear",
  bodyLimit({
    maxSize: MAX_WEBHOOK_BYTES,
    onError: (c) => c.text("Too large for a webhook", 413),
  }),
  async (c) => {
    const body = await c.req.text();
    const signature = c.req.header("linear-signature");
    if (!signature || !(await signedBy(c.env.LINEAR_WEBHOOK_SECRET, body, signature))) {
      return c.text("Bad signature", 401);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return c.text("Expected JSON", 400);
    }
    if (!isWebhookPayload(payload)) return c.text("Expected a JSON object", 400);
    const sent = payload.webhookTimestamp;
    if (typeof sent !== "number" || Math.abs(Date.now() - sent) > MAX_WEBHOOK_AGE_MS) {
      return c.text("Stale delivery", 400);
    }
    const teams = movesBoards(payload) ? teamsTouched(payload) : [];
    const channels = teamChannels(c.env.TEAM_CHANNELS);
    // A team that can't be told now hears with its next change, as when the board's own edits
    // can't publish. Failing the delivery wouldn't help: Linear retries a minute later at the
    // soonest, and a retry may be too old to take.
    await Promise.all(
      teams.map((teamId) =>
        channels.publish(teamId).catch((error: unknown) => {
          console.error(`Couldn't tell team ${teamId}'s boards it changed: ${error}`);
        }),
      ),
    );
    return c.body(null, 204);
  },
);

function isWebhookPayload(value: unknown): value is WebhookPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether the change can move what a board shows. */
function movesBoards({ type, action, updatedFrom }: WebhookPayload): boolean {
  if (!BOARD_EVENTS.has(type as string)) return false;
  if (type !== "Issue" || action !== "update") return true;
  // Without the changed fields, it might be any of them.
  if (typeof updatedFrom !== "object" || updatedFrom === null) return true;
  return Object.keys(updatedFrom).some((field) => BOARD_ISSUE_FIELDS.has(field));
}

function teamsTouched({ data, updatedFrom }: WebhookPayload): string[] {
  const ids = [data?.teamId, updatedFrom?.teamId].filter(
    (id): id is string => typeof id === "string" && id !== "",
  );
  return [...new Set(ids)];
}

/** Whether `signature` is the hex HMAC-SHA256 of `body` under `secret`, compared in constant time. */
export async function signedBy(secret: string, body: string, signature: string): Promise<boolean> {
  if (!secret || !/^(?:[0-9a-f]{2})+$/i.test(signature)) return false;
  const key = await hmacKey(secret, "verify");
  const bytes = new Uint8Array(signature.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(signature.slice(i * 2, i * 2 + 2), 16);
  }
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(body));
}

/** Signs `body` as Linear would, for tests and local tries. */
export async function sign(secret: string, body: string): Promise<string> {
  const key = await hmacKey(secret, "sign");
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return Array.from(mac, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The HMAC-SHA256 key Linear signs webhooks with, for signing or verifying. */
function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}
