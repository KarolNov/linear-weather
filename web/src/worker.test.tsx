import { describe, expect, it, vi } from "vitest";
import type { Board, BoardIssue } from "./board";
import { app, type Bindings } from "./worker";

const avengers = { id: "t-avg", name: "Avengers", key: "AVG" };
const ops = { id: "t-ops", name: "S.H.I.E.L.D. Ops", key: "OPS" };
const tony = { id: "u-tony", name: "Tony Stark", avatarUrl: null };

function issue(fields: Partial<BoardIssue>): BoardIssue {
  return {
    id: "i-1",
    identifier: "AVG-1",
    title: "Patch the arc reactor",
    url: "https://linear.app/shield/issue/AVG-1",
    dueDate: "2026-10-13",
    priority: 1,
    estimate: 5,
    state: { name: "In Progress", type: "started" },
    quadrant: "do",
    reason: "Urgent priority, overdue by 5 days",
    ...fields,
  };
}

const board: Board = {
  today: "2026-10-18",
  teams: [avengers, ops],
  team: avengers,
  people: [
    {
      assignee: tony,
      counts: { do: 1, schedule: 0, delegate: 0, drop: 1 },
      issues: [
        issue({}),
        issue({
          id: "i-2",
          identifier: "AVG-2",
          title: "Tidy the workshop",
          dueDate: null,
          priority: 4,
          estimate: null,
          quadrant: "drop",
        }),
      ],
    },
    { assignee: null, counts: { do: 0, schedule: 0, delegate: 0, drop: 0 }, issues: [] },
  ],
};

/** The server Worker: `viewer` for GraphQL, `boardResponse` for `/board`. */
function serverReturning(viewer: unknown, boardResponse = () => Response.json(board)) {
  const fetch = vi.fn(async (request: Request) =>
    new URL(request.url).pathname === "/board"
      ? boardResponse()
      : Response.json({ data: { viewer } }),
  );
  return { bindings: { SERVER: { fetch } } satisfies Bindings, fetch };
}

const fury = { name: "Nick Fury", avatarUrl: null, organization: { name: "S.H.I.E.L.D." } };

describe("web worker", () => {
  it("server-renders the sign-in page when signed out", async () => {
    const { bindings } = serverReturning(null);
    const res = await app.request("/", {}, bindings);
    expect(res.headers.get("content-type")).toContain("text/html");
    const page = await res.text();
    expect(page).toContain("See the storm before it hits your team.");
    expect(page).toContain('href="/auth/login"');
    expect(page).toContain('href="/?demo=true"');
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

  it("shows the demo workspace on ?demo=true, with a way out instead of signing out", async () => {
    const { bindings, fetch } = serverReturning({
      name: "Nick Fury",
      avatarUrl: null,
      organization: { name: "S.H.I.E.L.D." },
    });

    const page = await (await app.request("/?demo=true", {}, bindings)).text();

    expect(new URL(fetch.mock.calls[0]?.[0].url ?? "").search).toBe("?demo=true");
    expect(page).toContain("Nick Fury");
    expect(page).toContain("Exit demo");
    expect(page).not.toContain('action="/auth/logout"');
  });

  it("shows each person's matrix with their issues, linking to Linear", async () => {
    const { bindings } = serverReturning(fury);
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).toContain("Tony Stark");
    expect(page).toContain("2 open issues");
    expect(page).toContain("Unassigned");
    expect(page).toContain('href="https://linear.app/shield/issue/AVG-1"');
    expect(page).toContain("AVG-1");
    expect(page).toContain("Urgent");
    expect(page).toContain("Oct 13 · 5 days late");
    expect(page).toContain("5 pts");
    expect(page).toContain("No date");
  });

  it("asks for the picked team and keeps the demo in the picker", async () => {
    const { bindings, fetch } = serverReturning(fury);
    const page = await (await app.request("/?demo=true&team=t-ops", {}, bindings)).text();
    const boardUrl = new URL(fetch.mock.calls[1]?.[0].url ?? "");
    expect(boardUrl.pathname).toBe("/board");
    expect(boardUrl.searchParams.get("team")).toBe("t-ops");
    expect(boardUrl.searchParams.get("demo")).toBe("true");
    expect(page).toContain('name="team"');
    expect(page).toContain('<input type="hidden" name="demo" value="true"/>');
  });

  it("explains a spent rate limit instead of showing an empty board", async () => {
    const { bindings } = serverReturning(fury, () =>
      Response.json(
        { error: "rate_limited", resetAt: Date.UTC(2026, 9, 18, 16, 30) },
        { status: 503 },
      ),
    );
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).toContain("Couldn't load your team");
    expect(page).toContain("after 16:30 UTC");
  });

  it("says Linear didn't answer when the board fails to load", async () => {
    const { bindings } = serverReturning(fury, () => new Response("boom", { status: 500 }));
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).toContain("Linear didn't answer just now");
  });

  it("doesn't ask for the board when signed out", async () => {
    const { bindings, fetch } = serverReturning(null);
    await app.request("/", {}, bindings);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("doesn't ask for the demo without ?demo=true", async () => {
    const { bindings, fetch } = serverReturning(null);
    await app.request("/", {}, bindings);
    expect(new URL(fetch.mock.calls[0]?.[0].url ?? "").search).toBe("");
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
