// Linear's webhooks: an issue was created, updated (reassigned, its due date changed, …) or
// removed. Each is checked against the signing secret, then the team it touched (both teams,
// for an issue that moved) hears it changed, so its open boards read it again.

import { Hono } from "hono";
import { teamChannels } from "./team-channel";

/** How old a delivery may be, as Linear recommends, so a captured one can't be replayed later. */
export const MAX_WEBHOOK_AGE_MS = 60_000;

/** The kinds of change that can move what a board shows. Cycles decide what's in the current one. */
const BOARD_EVENTS = new Set(["Issue", "Cycle"]);

interface WebhookPayload {
  type?: unknown;
  webhookTimestamp?: unknown;
  data?: { teamId?: unknown };
  /** The changed fields' earlier values: `teamId` when an issue moved team. */
  updatedFrom?: { teamId?: unknown };
}

export const webhooks = new Hono<{ Bindings: Env }>().post("/linear", async (c) => {
  const body = await c.req.text();
  const signature = c.req.header("linear-signature");
  if (!signature || !(await signedBy(c.env.LINEAR_WEBHOOK_SECRET, body, signature))) {
    return c.text("Bad signature", 401);
  }
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(body) as WebhookPayload;
  } catch {
    return c.text("Expected JSON", 400);
  }
  const sent = payload.webhookTimestamp;
  if (typeof sent !== "number" || Math.abs(Date.now() - sent) > MAX_WEBHOOK_AGE_MS) {
    return c.text("Stale delivery", 400);
  }
  const teams = BOARD_EVENTS.has(payload.type as string) ? teamsTouched(payload) : [];
  const channels = teamChannels(c.env.TEAM_CHANNELS);
  await Promise.all(teams.map((teamId) => channels.publish(teamId)));
  return c.body(null, 204);
});

function teamsTouched({ data, updatedFrom }: WebhookPayload): string[] {
  const ids = [data?.teamId, updatedFrom?.teamId].filter(
    (id): id is string => typeof id === "string" && id !== "",
  );
  return [...new Set(ids)];
}

/** Whether `signature` is the hex HMAC-SHA256 of `body` under `secret`, compared in constant time. */
export async function signedBy(secret: string, body: string, signature: string): Promise<boolean> {
  if (!secret || !/^(?:[0-9a-f]{2})+$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = new Uint8Array(signature.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(signature.slice(i * 2, i * 2 + 2), 16);
  }
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(body));
}

/** Signs `body` as Linear would, for tests and local tries. */
export async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return Array.from(mac, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
