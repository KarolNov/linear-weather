import { describe, expect, it, vi } from "vitest";
import type { BoardData, BoardIssue, Matrix, Rules } from "./board";
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
    state: { name: "In Progress" },
    quadrantSource: "RULE",
    placementReason: "Urgent priority, overdue by 5 days",
    ...fields,
  };
}

const emptyMatrix: Matrix = {
  counts: { do: 0, schedule: 0, delegate: 0, drop: 0 },
  do: [],
  schedule: [],
  delegate: [],
  drop: [],
};

const tonysMatrix: Matrix = {
  counts: { do: 1, schedule: 0, delegate: 0, drop: 1 },
  do: [issue({})],
  schedule: [],
  delegate: [],
  drop: [
    issue({
      id: "i-2",
      identifier: "AVG-2",
      title: "Tidy the workshop",
      dueDate: null,
      priority: 4,
      estimate: null,
    }),
  ],
};

const unassigned: Matrix = {
  ...emptyMatrix,
  counts: { ...emptyMatrix.counts, drop: 1 },
  drop: [issue({ id: "i-3", identifier: "AVG-3", title: "Find a new HQ", dueDate: null })],
};

/** The board query's answer when `viewer` is signed in. */
function boardData(viewer: unknown, team: BoardData["team"] = defaultTeam) {
  return { today: "2026-10-18", viewer, teams: [avengers, ops], team };
}

const defaultRules: Rules = { importantFrom: 3, urgencyWindowDays: 14, noDueDate: "NOT_URGENT" };

const defaultTeam: BoardData["team"] = {
  ...avengers,
  rules: defaultRules,
  people: [{ ...tony, matrix: tonysMatrix }],
  unassigned,
};

/** The server Worker's GraphQL endpoint: `viewer` null when signed out, else their board. */
function serverReturning(
  viewer: unknown,
  graphqlResponse = () =>
    Response.json({
      data: viewer ? boardData(viewer) : { ...boardData(null), teams: null, team: null },
    }),
) {
  const fetch = vi.fn(async (_request: Request) => graphqlResponse());
  return { bindings: { SERVER: { fetch } } satisfies Bindings, fetch };
}

/** What the web Worker asked the server's GraphQL endpoint. */
async function sentQuery(request: Request | undefined) {
  return (await request?.clone().json()) as { query: string; variables: { teamId: string | null } };
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

  it("marks issues placed by hand, saying where the rules would put them", async () => {
    const reason = "Placed by hand; the rules say Drop (Low priority, no due date)";
    const pinned = {
      ...defaultTeam,
      people: [
        {
          ...tony,
          matrix: {
            ...emptyMatrix,
            counts: { ...emptyMatrix.counts, do: 1 },
            do: [issue({ quadrantSource: "OVERRIDE", placementReason: reason })],
          },
        },
      ],
      unassigned: emptyMatrix,
    } satisfies BoardData["team"];
    const { bindings } = serverReturning(fury, () =>
      Response.json({ data: boardData(fury, pinned) }),
    );
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).toContain("By hand");
    expect(page).toContain(`title="${reason}"`);
    expect(page).toContain("Move AVG-1");
    expect(page).toContain("Sorting rules");
  });

  it("doesn't mark issues the rules placed", async () => {
    const { bindings } = serverReturning(fury);
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).not.toContain("By hand");
  });

  it("asks for the picked team and keeps the demo in the picker", async () => {
    const { bindings, fetch } = serverReturning(fury);
    const page = await (await app.request("/?demo=true&team=t-ops", {}, bindings)).text();
    const request = fetch.mock.calls[0]?.[0];
    const url = new URL(request?.url ?? "");
    expect(url.pathname).toBe("/graphql");
    expect(url.searchParams.get("demo")).toBe("true");
    expect((await sentQuery(request)).variables).toEqual({ teamId: "t-ops" });
    expect(page).toContain('href="/?demo=true&amp;team=t-avg"');
    expect(page).toContain('aria-current="page"');
  });

  it("says nobody has open issues when every member's matrix is empty", async () => {
    const quiet = {
      ...avengers,
      rules: defaultRules,
      people: [{ ...tony, matrix: emptyMatrix }],
      unassigned: emptyMatrix,
    };
    const { bindings } = serverReturning(fury, () =>
      Response.json({ data: boardData(fury, quiet) }),
    );
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).toContain("Nobody on this team has open issues.");
    expect(page).not.toContain("Expand all");
    expect(page).not.toContain("Unassigned");
  });

  it("explains a spent rate limit instead of showing an empty board", async () => {
    const { bindings } = serverReturning(fury, () =>
      Response.json({
        data: { ...boardData(fury), teams: null, team: null },
        errors: [
          {
            message: "Linear's rate limit is spent for now",
            path: ["teams"],
            extensions: { code: "RATE_LIMITED", resetAt: Date.UTC(2026, 9, 18, 16, 30) },
          },
        ],
      }),
    );
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).toContain("Couldn't load your team");
    expect(page).toContain("after 16:30 UTC");
  });

  it("says Linear didn't answer when the board fails to load", async () => {
    const { bindings } = serverReturning(fury, () =>
      Response.json({
        data: { ...boardData(fury), team: null },
        errors: [{ message: "Unexpected error.", path: ["team"] }],
      }),
    );
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).toContain("Fury");
    expect(page).toContain("Linear didn't answer just now");
  });

  it("asks the server once per page, for the viewer and the board together", async () => {
    const { bindings, fetch } = serverReturning(fury);
    await app.request("/", {}, bindings);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new URL(fetch.mock.calls[0]?.[0].url ?? "").pathname).toBe("/graphql");
  });

  it("shows the sign-in page when the server has just ended a rejected session", async () => {
    const { bindings } = serverReturning(fury, () =>
      Response.json({
        data: { ...boardData(null), teams: null, team: null },
        errors: [{ message: "Linear rejected the session; sign in again", path: ["teams"] }],
      }),
    );
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).toContain('href="/auth/login"');
    expect(page).not.toContain("Linear didn't answer");
  });

  it("doesn't ask for the demo without ?demo=true", async () => {
    const { bindings, fetch } = serverReturning(null);
    await app.request("/", {}, bindings);
    expect(new URL(fetch.mock.calls[0]?.[0].url ?? "").search).toBe("");
  });

  it("says Linear is unreachable instead of showing signed out when the server fails", async () => {
    const errored = vi.fn(async (_request: Request) =>
      Response.json({
        data: { ...boardData(null), viewer: null },
        errors: [{ message: "Unexpected error.", path: ["viewer"] }],
      }),
    );
    const crashed = vi.fn(
      async (_request: Request) => new Response("Internal Server Error", { status: 500 }),
    );
    const unreadable = vi.fn(
      async (_request: Request) => new Response("Bad Gateway", { status: 502 }),
    );
    for (const fetch of [errored, crashed, unreadable]) {
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
