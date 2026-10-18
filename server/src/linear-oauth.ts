// Linear's OAuth 2.0 endpoints: https://linear.app/developers/oauth-2-0-authentication

const AUTHORIZE_URL = "https://linear.app/oauth/authorize";
const TOKEN_URL = "https://api.linear.app/oauth/token";
const REVOKE_URL = "https://api.linear.app/oauth/revoke";

// `write` is for reassigning issues (#16). Asking up front saves users a second consent later.
export const SCOPES = ["read", "write"];

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch milliseconds, or null when Linear didn't send `expires_in`. */
  expiresAt: number | null;
}

export class OAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function authorizeUrl(client: OAuthClient, state: string, codeChallenge: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: "code",
    scope: SCOPES.join(","),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    actor: "user",
  }).toString();
  return url.toString();
}

export function exchangeCode(client: OAuthClient, code: string, codeVerifier: string) {
  return requestTokens({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: client.redirectUri,
    client_id: client.clientId,
    client_secret: client.clientSecret,
  });
}

// Linear rotates refresh tokens on every refresh. Replaying the same refresh request within
// 30 minutes returns the same new pair, so two requests racing to refresh both succeed.
export function refreshTokens(client: Omit<OAuthClient, "redirectUri">, refreshToken: string) {
  return requestTokens({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: client.clientId,
    client_secret: client.clientSecret,
  });
}

/** Best effort: a token that's already invalid is as good as revoked. */
export async function revokeToken(
  client: Omit<OAuthClient, "redirectUri">,
  token: string,
  tokenTypeHint: "access_token" | "refresh_token",
): Promise<void> {
  const res = await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token,
      token_type_hint: tokenTypeHint,
      client_id: client.clientId,
      client_secret: client.clientSecret,
    }),
  }).catch((error: unknown) => {
    console.warn(`Linear token revocation failed: ${error}`);
    return null;
  });
  if (res && !res.ok) {
    console.warn(`Linear token revocation failed (${res.status}): ${await res.text()}`);
  }
}

async function requestTokens(params: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!res.ok) {
    throw new OAuthError(`Linear token request failed: ${await res.text()}`, res.status);
  }
  const body = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: body.expires_in ? Date.now() + body.expires_in * 1000 : null,
  };
}
