import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { OAuthError, refreshTokens, type TokenSet } from "./linear-oauth";

// A login session maps an opaque cookie to the user's Linear tokens, which never reach the
// browser. KV is keyed by a hash of the cookie, so reading KV doesn't hand out live cookies.

export type AppContext = Context<{ Bindings: Env }>;

const COOKIE = "lw_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
// Refresh a little early so a token doesn't expire mid-request.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** The value of the Authorization header for Linear's API, or null when signed out. */
export type LinearAuthorization = string;

export async function startSession(c: AppContext, tokens: TokenSet): Promise<void> {
  const id = randomToken();
  await save(c.env, id, tokens);
  setCookie(c, COOKIE, id, { ...cookieOptions(c), maxAge: SESSION_TTL_SECONDS });
}

/** How this app's cookies are scoped: the session's, and the demo's. */
export function cookieOptions(c: AppContext) {
  return { httpOnly: true, secure: isHttps(c), sameSite: "Lax", path: "/" } as const;
}

/** Ends the session and returns its tokens so the caller can revoke them. */
export async function endSession(c: AppContext): Promise<TokenSet | null> {
  const tokens = await discardSession(c);
  deleteCookie(c, COOKIE, { path: "/", secure: isHttps(c) });
  return tokens;
}

/** Forgets the session's tokens but leaves the cookie alone, returning them for revocation. */
export async function discardSession(c: AppContext): Promise<TokenSet | null> {
  const id = getCookie(c, COOKIE);
  if (!id) return null;
  const key = await kvKey(id);
  const tokens = await c.env.SESSIONS.get<TokenSet>(key, "json");
  await c.env.SESSIONS.delete(key);
  return tokens;
}

export async function linearAuthorization(c: AppContext): Promise<LinearAuthorization | null> {
  const id = getCookie(c, COOKIE);
  const tokens = id ? await loadFresh(c.env, id) : null;
  if (tokens) return `Bearer ${tokens.accessToken}`;

  // Dev shortcut: personal API keys go in the header as-is, without "Bearer".
  if (c.env.LINEAR_API_KEY && isLocalhost(c)) return c.env.LINEAR_API_KEY;
  return null;
}

async function loadFresh(env: Env, id: string): Promise<TokenSet | null> {
  const key = await kvKey(id);
  const tokens = await env.SESSIONS.get<TokenSet>(key, "json");
  if (!tokens) return null;
  if (tokens.expiresAt === null || tokens.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return tokens;
  }
  if (!tokens.refreshToken) {
    await env.SESSIONS.delete(key);
    return null;
  }

  try {
    const refreshed = await refreshTokens(
      { clientId: env.LINEAR_CLIENT_ID, clientSecret: env.LINEAR_CLIENT_SECRET },
      tokens.refreshToken,
    );
    // A refresh response may omit refresh_token, meaning the old one stays valid.
    const next = { ...refreshed, refreshToken: refreshed.refreshToken ?? tokens.refreshToken };
    await save(env, id, next);
    return next;
  } catch (error) {
    // Linear rejected the refresh token (revoked, or the app was uninstalled): sign out.
    // Anything else (network, 5xx) may be transient, so keep the session for a retry.
    if (error instanceof OAuthError && error.status >= 400 && error.status < 500) {
      await env.SESSIONS.delete(key);
      return null;
    }
    throw error;
  }
}

async function save(env: Env, id: string, tokens: TokenSet): Promise<void> {
  await env.SESSIONS.put(await kvKey(id), JSON.stringify(tokens), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}

async function kvKey(id: string): Promise<string> {
  return `session:${await sha256Base64url(id)}`;
}

export async function sha256Base64url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return base64url(new Uint8Array(digest));
}

export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function isHttps(c: AppContext): boolean {
  return new URL(c.req.url).protocol === "https:";
}

// Cloudflare routes by hostname, so a deployed Worker never sees a localhost URL.
function isLocalhost(c: AppContext): boolean {
  const { hostname } = new URL(c.req.url);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
