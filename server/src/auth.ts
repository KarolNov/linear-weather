import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  authorizeUrl,
  exchangeCode,
  type OAuthClient,
  OAuthError,
  revokeToken,
  type TokenSet,
} from "./linear-oauth";
import {
  type AppContext,
  discardSession,
  endSession,
  isHttps,
  randomToken,
  sha256Base64url,
  startSession,
} from "./session";

// Authorization-code flow with PKCE. The `state` and PKCE verifier ride along in a short-lived
// cookie between /auth/login and /auth/callback.
const PENDING_COOKIE = "lw_oauth";
const PENDING_TTL_SECONDS = 10 * 60;

export const auth = new Hono<{ Bindings: Env }>()
  .get("/login", async (c) => {
    const state = randomToken();
    const verifier = randomToken();
    setCookie(c, PENDING_COOKIE, `${state}.${verifier}`, {
      httpOnly: true,
      secure: isHttps(c),
      // Lax still sends the cookie on the top-level redirect back from linear.app.
      sameSite: "Lax",
      path: "/auth",
      maxAge: PENDING_TTL_SECONDS,
    });
    return c.redirect(authorizeUrl(oauthClient(c), state, await sha256Base64url(verifier)));
  })
  .get("/callback", async (c) => {
    const { code, state, error } = c.req.query();
    const pending = getCookie(c, PENDING_COOKIE);
    deleteCookie(c, PENDING_COOKIE, { path: "/auth", secure: isHttps(c) });

    // The user declined, or Linear refused the request.
    if (error) return c.redirect(`/?auth_error=${encodeURIComponent(error)}`);

    const [expectedState, verifier] = pending?.split(".") ?? [];
    if (!code || !state || !expectedState || !verifier || state !== expectedState) {
      return c.text("This sign-in link expired or didn't come from us. Please sign in again.", 400);
    }

    let tokens: TokenSet;
    try {
      tokens = await exchangeCode(oauthClient(c), code, verifier);
    } catch (e) {
      if (!(e instanceof OAuthError)) throw e;
      console.error(e.message);
      return c.redirect("/?auth_error=token_exchange_failed");
    }
    // Signing in again replaces any session this browser already had.
    const previous = await discardSession(c);
    await startSession(c, tokens);
    await revokeAll(c, previous);
    return c.redirect("/");
  })
  .post("/logout", async (c) => {
    await revokeAll(c, await endSession(c));
    return c.redirect("/", 303);
  });

function oauthClient(c: AppContext): OAuthClient {
  return {
    clientId: c.env.LINEAR_CLIENT_ID,
    clientSecret: c.env.LINEAR_CLIENT_SECRET,
    // Requests arrive through the web Worker unchanged, so this is the web origin the
    // browser sees. Register exactly this URL in Linear.
    redirectUri: new URL("/auth/callback", c.req.url).toString(),
  };
}

async function revokeAll(c: AppContext, tokens: TokenSet | null): Promise<void> {
  if (!tokens) return;
  const client = oauthClient(c);
  await Promise.all([
    tokens.refreshToken && revokeToken(client, tokens.refreshToken, "refresh_token"),
    revokeToken(client, tokens.accessToken, "access_token"),
  ]);
}
