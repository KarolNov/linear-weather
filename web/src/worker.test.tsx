import { describe, expect, it, vi } from "vitest";
import { app, type Bindings } from "./worker";

function serverReturning(viewer: unknown) {
  const fetch = vi.fn(async (_request: Request) => Response.json({ data: { viewer } }));
  return { bindings: { SERVER: { fetch } } satisfies Bindings, fetch };
}

describe("web worker", () => {
  it("server-renders the sign-in page when signed out", async () => {
    const { bindings } = serverReturning(null);
    const res = await app.request("/", {}, bindings);
    expect(res.headers.get("content-type")).toContain("text/html");
    const page = await res.text();
    expect(page).toContain("See the storm before it hits your team.");
    expect(page).toContain('href="/auth/login"');
    expect(page).toContain('<link rel="stylesheet"');
  });

  it("shows who is signed in, asking the server with the browser's cookie", async () => {
    const { bindings, fetch } = serverReturning({
      name: "Ada Lovelace",
      avatarUrl: null,
      organization: { name: "Analytical Engines" },
    });

    const res = await app.request("/", { headers: { cookie: "lw_session=abc" } }, bindings);

    const page = await res.text();
    expect(page).toContain("Ada Lovelace");
    expect(page).toContain('action="/auth/logout"');
    expect(fetch.mock.calls[0]?.[0].headers.get("cookie")).toBe("lw_session=abc");
  });

  it("asks the server for the demo workspace on ?demo=true", async () => {
    const { bindings, fetch } = serverReturning(null);
    await app.request("/?demo=true", {}, bindings);
    await app.request("/", {}, bindings);
    expect(new URL(fetch.mock.calls[0]?.[0].url ?? "").search).toBe("?demo=true");
    expect(new URL(fetch.mock.calls[1]?.[0].url ?? "").search).toBe("");
  });

  it("says Linear is unreachable instead of showing signed out when the server fails", async () => {
    const errored = vi.fn(async (_request: Request) =>
      Response.json({ data: { viewer: null }, errors: [{ message: "Unexpected error." }] }),
    );
    const crashed = vi.fn(
      async (_request: Request) => new Response("Internal Server Error", { status: 500 }),
    );
    for (const fetch of [errored, crashed]) {
      const page = await (await app.request("/", {}, { SERVER: { fetch } })).text();
      expect(page).toContain("Couldn't reach Linear");
      expect(page).not.toContain('href="/auth/login"');
    }
  });

  it("404s unknown paths without asking the server", async () => {
    const { bindings, fetch } = serverReturning(null);
    const res = await app.request("/favicon.ico", {}, bindings);
    expect(res.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("explains a cancelled sign-in", async () => {
    const { bindings } = serverReturning(null);
    const res = await app.request("/?auth_error=access_denied", {}, bindings);
    expect(await res.text()).toContain("Sign-in was cancelled.");
  });

  it("embeds the props for hydration without breaking out of the script tag", async () => {
    const { bindings } = serverReturning({
      name: "</script><script>alert(1)</script>",
      avatarUrl: null,
      organization: { name: "Evil" },
    });
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).not.toContain("</script><script>alert(1)");
  });

  it.each(["/auth/login", "/auth/callback?code=x", "/graphql"])(
    "passes %s through to the server unchanged",
    async (path) => {
      const fetch = vi.fn(async (_request: Request) => new Response("from server"));
      const res = await app.request(path, {}, { SERVER: { fetch } });
      expect(await res.text()).toBe("from server");
      expect(fetch.mock.calls[0]?.[0].url).toBe(`http://localhost${path}`);
    },
  );
});
