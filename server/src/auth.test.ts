import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "./index";

const ORIGIN = "http://localhost:5173";
const VIEWER = {
  id: "user-1",
  name: "Ada Lovelace",
  avatarUrl: null,
  organization: { name: "Analytical Engines", urlKey: "ae" },
};

// Stands in for linear.app: records what we sent and answers like Linear does.
let linear: ReturnType<typeof fakeLinear>;

function fakeLinear() {
  const calls: { url: string; headers: Headers; body: string }[] = [];
  const validTokens = new Set<string>();
  let issued = 0;
  const fake = { fetchMock: vi.fn<typeof fetch>(), calls, expiresIn: 86399 };
  const issue = () => {
    issued += 1;
    validTokens.add(`access-${issued}`);
    return Response.json({
      access_token: `access-${issued}`,
      refresh_token: `refresh-${issued}`,
      token_type: "Bearer",
      expires_in: fake.expiresIn,
      scope: "read,write",
    });
  };

  fake.fetchMock.mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const body = new TextDecoder().decode(await request.arrayBuffer());
    calls.push({ url: request.url, headers: request.headers, body });
    const form = new URLSearchParams(body);

    switch (request.url) {
      case "https://api.linear.app/oauth/token":
        if (form.get("grant_type") === "authorization_code" && form.get("code") === "good-code") {
          return issue();
        }
        if (
          form.get("grant_type") === "refresh_token" &&
          form.get("refresh_token") === "refresh-1"
        ) {
          return issue();
        }
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      case "https://api.linear.app/oauth/revoke":
        validTokens.delete(form.get("token") ?? "");
        return new Response(null, { status: 200 });
      case "https://api.linear.app/graphql": {
        const auth = request.headers.get("authorization") ?? "";
        const ok = validTokens.has(auth.replace(/^Bearer /, "")) || auth === "lin_api_dev";
        if (!ok) {
          return Response.json(
            {
              errors: [
                {
                  message: "Authentication required",
                  extensions: { code: "AUTHENTICATION_ERROR" },
                },
              ],
            },
            { status: 400 },
          );
        }
        return Response.json({ data: { viewer: VIEWER } });
      }
    }
    throw new Error(`Unexpected fetch to ${request.url}`);
  });

  return fake;
}

beforeEach(() => {
  linear = fakeLinear();
  vi.spyOn(globalThis, "fetch").mockImplementation(linear.fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function startLogin() {
  const res = await app.request(`${ORIGIN}/auth/login`, {}, env);
  const location = new URL(res.headers.get("location") ?? "");
  return { res, location, cookie: cookiesFrom(res), state: location.searchParams.get("state") };
}

async function signIn(): Promise<string> {
  const { cookie, state } = await startLogin();
  const res = await app.request(
    `${ORIGIN}/auth/callback?code=good-code&state=${state}`,
    { headers: { cookie } },
    env,
  );
  expect(res.status).toBe(302);
  return cookiesFrom(res)
    .split("; ")
    .filter((c) => c.startsWith("lw_session="))
    .join("; ");
}

async function viewer(cookie?: string, bindings: Env = env) {
  const res = await app.request(
    `${ORIGIN}/graphql`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ query: "{ viewer { name organization { name } } }" }),
    },
    bindings,
  );
  return ((await res.json()) as { data: { viewer: unknown } }).data.viewer;
}

describe("/auth/login", () => {
  it("redirects to Linear's consent screen with PKCE and state", async () => {
    const { res, location, cookie } = await startLogin();

    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://linear.app/oauth/authorize");
    expect(Object.fromEntries(location.searchParams)).toMatchObject({
      client_id: "test-client-id",
      redirect_uri: `${ORIGIN}/auth/callback`,
      response_type: "code",
      scope: "read,write",
      code_challenge_method: "S256",
      actor: "user",
    });
    expect(location.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    expect(cookie).toContain(`lw_oauth=${location.searchParams.get("state")}.`);
  });
});

describe("/auth/callback", () => {
  it("exchanges the code and signs the user in", async () => {
    const { cookie, state } = await startLogin();
    const verifier = cookie.split(".")[1];

    const res = await app.request(
      `${ORIGIN}/auth/callback?code=good-code&state=${state}`,
      { headers: { cookie } },
      env,
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    const setCookie = res.headers.getSetCookie().join("\n");
    expect(setCookie).toMatch(/lw_session=[\w-]+; Max-Age=\d+; Path=\/; HttpOnly; SameSite=Lax/);

    const tokenRequest = new URLSearchParams(linear.calls[0]?.body);
    expect(Object.fromEntries(tokenRequest)).toEqual({
      grant_type: "authorization_code",
      code: "good-code",
      code_verifier: verifier,
      redirect_uri: `${ORIGIN}/auth/callback`,
      client_id: "test-client-id",
      client_secret: "test-client-secret",
    });
  });

  it("revokes the session this browser had before signing in again", async () => {
    const first = await signIn();
    const { cookie, state } = await startLogin();
    await app.request(
      `${ORIGIN}/auth/callback?code=good-code&state=${state}`,
      { headers: { cookie: `${cookie}; ${first}` } },
      env,
    );
    const revoked = linear.calls
      .filter((c) => c.url.endsWith("/oauth/revoke"))
      .map((c) => new URLSearchParams(c.body).get("token"));
    expect(revoked.sort()).toEqual(["access-1", "refresh-1"]);
    expect(await viewer(first)).toBeNull();
  });

  it("rejects a state that doesn't match the one we issued", async () => {
    const { cookie } = await startLogin();
    const res = await app.request(
      `${ORIGIN}/auth/callback?code=good-code&state=forged`,
      { headers: { cookie } },
      env,
    );
    expect(res.status).toBe(400);
    expect(linear.calls).toHaveLength(0);
  });

  it("rejects a callback without the pending-login cookie", async () => {
    const { state } = await startLogin();
    const res = await app.request(`${ORIGIN}/auth/callback?code=good-code&state=${state}`, {}, env);
    expect(res.status).toBe(400);
  });

  it("sends the user home with the error when they decline", async () => {
    const res = await app.request(`${ORIGIN}/auth/callback?error=access_denied`, {}, env);
    expect(res.headers.get("location")).toBe("/?auth_error=access_denied");
  });

  it("reports a failed token exchange", async () => {
    const { cookie, state } = await startLogin();
    const res = await app.request(
      `${ORIGIN}/auth/callback?code=bad-code&state=${state}`,
      { headers: { cookie } },
      env,
    );
    expect(res.headers.get("location")).toBe("/?auth_error=token_exchange_failed");
    expect(res.headers.getSetCookie().join()).not.toContain("lw_session=");
  });
});

describe("viewer", () => {
  it("is null when signed out", async () => {
    expect(await viewer()).toBeNull();
  });

  it("is the Linear user, fetched with their own token", async () => {
    const cookie = await signIn();
    expect(await viewer(cookie)).toEqual({
      name: "Ada Lovelace",
      organization: { name: "Analytical Engines" },
    });
    expect(linear.calls.at(-1)?.headers.get("authorization")).toBe("Bearer access-1");
  });

  it("is null once the user revokes access in Linear", async () => {
    const cookie = await signIn();
    linear = fakeLinear(); // forgets every issued token
    vi.mocked(fetch).mockImplementation(linear.fetchMock);
    expect(await viewer(cookie)).toBeNull();
  });

  it("refreshes an access token that is about to expire", async () => {
    linear.expiresIn = 60; // inside the refresh margin
    const cookie = await signIn();

    expect(await viewer(cookie)).not.toBeNull();

    const refresh = new URLSearchParams(linear.calls.at(-2)?.body);
    expect(refresh.get("grant_type")).toBe("refresh_token");
    expect(refresh.get("refresh_token")).toBe("refresh-1");
    expect(linear.calls.at(-1)?.headers.get("authorization")).toBe("Bearer access-2");
  });

  it("keeps the refresh token when a refresh response omits it", async () => {
    linear.expiresIn = 60;
    const cookie = await signIn();
    linear.fetchMock.mockImplementationOnce(async () =>
      Response.json({ access_token: "access-1", expires_in: 60 }),
    );
    await viewer(cookie);
    await viewer(cookie);
    const refreshes = linear.calls
      .filter((c) => new URLSearchParams(c.body).get("grant_type") === "refresh_token")
      .map((c) => new URLSearchParams(c.body).get("refresh_token"));
    // The first refresh hit the one-off mock above; the second must reuse the kept token.
    expect(refreshes).toEqual(["refresh-1"]);
  });

  it("forgets the session once Linear rejects its token", async () => {
    const cookie = await signIn();
    linear = fakeLinear();
    vi.mocked(fetch).mockImplementation(linear.fetchMock);
    await viewer(cookie);
    await viewer(cookie);
    expect(linear.calls.filter((c) => c.url.endsWith("/graphql"))).toHaveLength(1);
  });

  it("falls back to the dev API key on localhost", async () => {
    const devEnv = { ...env, LINEAR_API_KEY: "lin_api_dev" };
    expect(await viewer(undefined, devEnv)).not.toBeNull();
    expect(linear.calls.at(-1)?.headers.get("authorization")).toBe("lin_api_dev");
  });

  it("ignores the dev API key anywhere but localhost", async () => {
    const res = await app.request(
      "https://weather.example.com/graphql",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ viewer { name } }" }),
      },
      { ...env, LINEAR_API_KEY: "lin_api_dev" },
    );
    expect(await res.json()).toEqual({ data: { viewer: null } });
    expect(linear.calls).toHaveLength(0);
  });

  it("serves the demo workspace for ?demo=true, signed in or not", async () => {
    const cookie = await signIn();
    for (const session of [undefined, cookie]) {
      const res = await app.request(
        `${ORIGIN}/graphql?demo=true`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(session ? { cookie: session } : {}) },
          body: JSON.stringify({ query: "{ viewer { name organization { name } } }" }),
        },
        env,
      );
      expect(await res.json()).toEqual({
        data: { viewer: { name: "Nick Fury", organization: { name: "S.H.I.E.L.D." } } },
      });
    }
    expect(linear.calls.filter((c) => c.url.endsWith("/graphql"))).toHaveLength(0);
  });
});

describe("/auth/logout", () => {
  it("revokes the tokens and ends the session", async () => {
    const cookie = await signIn();

    const res = await app.request(
      `${ORIGIN}/auth/logout`,
      { method: "POST", headers: { cookie } },
      env,
    );

    expect(res.status).toBe(303);
    expect(res.headers.getSetCookie().join()).toMatch(/lw_session=;.*Max-Age=0/);
    const revoked = linear.calls
      .filter((c) => c.url.endsWith("/oauth/revoke"))
      .map((c) => new URLSearchParams(c.body).get("token"));
    expect(revoked.sort()).toEqual(["access-1", "refresh-1"]);
    for (const call of linear.calls.filter((c) => c.url.endsWith("/oauth/revoke"))) {
      expect(new URLSearchParams(call.body).get("client_secret")).toBe("test-client-secret");
    }
    expect(await viewer(cookie)).toBeNull();
  });

  it("is not reachable with GET", async () => {
    const res = await app.request(`${ORIGIN}/auth/logout`, {}, env);
    expect(res.status).toBe(404);
  });
});
