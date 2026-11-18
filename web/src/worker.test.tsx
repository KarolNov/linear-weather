import { renderToString } from "preact-render-to-string";
import { describe, expect, it, vi } from "vitest";
import {
  type BoardData,
  type BoardIssue,
  type Matrix,
  type PersonMatrix,
  type Rules,
  runningLate,
  type Suggestion,
} from "./board";
import { documentText } from "./operations";
import { ConfirmMoves, RebalancePanel, stillPlanned } from "./RebalancePanel";
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

const defaultRules: Rules = {
  importantFrom: 3,
  urgencyWindowDays: 14,
  noDueDate: "NOT_URGENT",
  dropAlertPercent: 40,
  awayStatuses: [],
  blockersAreImportant: false,
};

const healthyBacklog = { rotting: false, reason: "1 of 4 open issues (25%) are in Drop" };

const wanda = { id: "u-wanda", name: "Wanda Maximoff", avatarUrl: null };

const nowMove: Suggestion = {
  issue: {
    id: "i-11",
    identifier: "AVG-11",
    title: "Rotate the Quinjet's keys",
    url: "https://linear.app/shield/issue/AVG-11",
    quadrant: "DELEGATE",
    becomesUrgentOn: "2026-10-18",
  },
  from: tony,
  to: wanda,
  week: null,
  toWeather: "SUNNY",
  reason: "Tony Stark goes from 2.75× to 2.5× the team average, Wanda Maximoff from 0.0× to 0.25×",
};

const forecastMove: Suggestion = {
  issue: {
    id: "i-7",
    identifier: "AVG-7",
    title: "Brief the new recruits",
    url: "https://linear.app/shield/issue/AVG-7",
    quadrant: "SCHEDULE",
    becomesUrgentOn: "2026-11-03",
  },
  from: tony,
  to: wanda,
  week: 3,
  toWeather: "CLOUDY",
  reason: "Tony Stark goes from 2.0× to 1.5× the team average, Wanda Maximoff from 0.5× to 1.0×",
};

const defaultTeam: BoardData["team"] = {
  ...avengers,
  rules: defaultRules,
  weather: { kind: "STORM", reason: "Tony Stark is in a storm" },
  backlogRot: healthyBacklog,
  rebalanceNow: [nowMove],
  rebalanceForecast: [forecastMove],
  people: [
    {
      ...tony,
      capacity: 1,
      timeOff: [],
      matrix: tonysMatrix,
      weather: { kind: "STORM" as const, reason: "4 urgent points", overdue: 0 },
      forecast: [
        {
          startsOn: "2026-10-18",
          endsOn: "2026-10-24",
          weather: { kind: "STORM" as const, reason: "4 urgent points" },
          summary: "Nothing new turns urgent",
          turningUrgent: [],
        },
        {
          startsOn: "2026-10-25",
          endsOn: "2026-10-31",
          weather: { kind: "RAIN" as const, reason: "5 urgent points" },
          summary: "1 High-priority issue becomes urgent",
          turningUrgent: [{ identifier: "AVG-7" }],
        },
      ],
    },
  ],
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
  if (!request) throw new Error("nothing was sent");
  const { documentId, variables, ...rest } = (await request.clone().json()) as {
    documentId: string;
    variables: { teamId: string | null };
  };
  // Looked up by id, as the server does.
  return { query: documentText(documentId), variables, ...rest };
}

const fury = { name: "Nick Fury", avatarUrl: null, organization: { name: "S.H.I.E.L.D." } };

/** A rebalance panel nothing is moving in yet. */
const moving = {
  pending: new Set<string>(),
  applying: false,
  onReassign: () => {},
  onApplyNow: () => {},
};

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

  it("shows how much each person works, to change from the board", async () => {
    const { bindings } = serverReturning(fury);
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).toContain("Tony Stark's capacity");
    expect(page).toContain('<option selected value="1">Full time</option>');
    expect(page).toContain(">Half time</option>");
  });

  it("shows who's away, with their time off to take back or add to", async () => {
    const reason = "Away until Oct 23, holding 1 urgent issue";
    const away = {
      ...defaultTeam,
      weather: { kind: "STORM" as const, reason: "Tony Stark is away with 1 urgent issue" },
      people: [
        {
          ...tony,
          capacity: 1,
          timeOff: [
            { id: "t-1", startsOn: "2026-10-16", endsOn: "2026-10-23" },
            { id: "t-2", startsOn: "2026-11-26", endsOn: "2026-11-26" },
          ],
          matrix: tonysMatrix,
          weather: { kind: "AWAY" as const, reason, overdue: 0 },
          forecast: [],
        },
      ],
    } satisfies BoardData["team"];
    const { bindings } = serverReturning(fury, () =>
      Response.json({ data: boardData(fury, away) }),
    );
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).toContain(`aria-label="Away: ${reason}"`);
    expect(page).toContain(`aria-label="Tony Stark's time off"`);
    expect(page).toContain("Away Oct 16 – Oct 23");
    expect(page).toContain("Away Nov 26");
    expect(page).toContain("Take back Tony Stark's time off, Nov 26");
    expect(page).toContain(">Add time off</button>");
  });

  it("offers to add time off for someone with none", async () => {
    const { bindings } = serverReturning(fury);
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).toContain(">Add time off for Tony Stark</button>");
  });

  it("shows the team's weather and why, and lets it set the sky and the browser's chrome", async () => {
    const { bindings } = serverReturning(fury);
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).toContain('aria-label="Team weather: Storm."');
    expect(page).toContain("Tony Stark is in a storm");
    expect(page).toContain('data-weather="storm"');
    expect(page).toContain('<meta name="theme-color" content="#2a2843" />');
  });

  it("flags backlog rot in the header only past the team's alert", async () => {
    const reason = "12 of 20 open issues (60%) are in Drop, over the team's 40% alert";
    const rotting = { ...defaultTeam, backlogRot: { rotting: true, reason } };
    const { bindings } = serverReturning(fury, () =>
      Response.json({ data: boardData(fury, rotting) }),
    );
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).toContain("Backlog rot:");
    expect(page).toContain(reason);

    const healthy = await (await app.request("/", {}, serverReturning(fury).bindings)).text();
    expect(healthy).not.toContain("Backlog rot:");
  });

  it("marks issues placed by hand, saying where the rules would put them", async () => {
    const reason = "Placed by hand; the rules say Drop (Low priority, no due date)";
    const pinned = {
      ...defaultTeam,
      people: [
        {
          ...tony,
          capacity: 1,
          timeOff: [],
          matrix: {
            ...emptyMatrix,
            counts: { ...emptyMatrix.counts, do: 1 },
            do: [issue({ quadrantSource: "OVERRIDE", placementReason: reason })],
          },
          weather: { kind: "CLOUDY" as const, reason: "1 urgent issue", overdue: 0 },
          forecast: [],
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

  it("shows each person's forecast, saying what turns urgent each week", async () => {
    const { bindings } = serverReturning(fury);
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).toContain(`aria-label="Tony Stark's forecast"`);
    expect(page).toContain("By Oct 24: Storm. 4 urgent points.");
    expect(page).toContain(
      "By Oct 31: Rain. 5 urgent points. 1 High-priority issue becomes urgent: AVG-7.",
    );
  });

  it("offers rebalancing, counting the moves it would suggest", async () => {
    const { bindings } = serverReturning(fury);
    const page = await (await app.request("/", {}, bindings)).text();
    expect(page).toContain("Rebalance · 2");
  });

  it("lists moves for now and for the forecast, each with the taker's weather after", () => {
    const panel = renderToString(
      <RebalancePanel
        teamName="Avengers"
        rebalanceNow={[nowMove]}
        rebalanceForecast={[forecastMove]}
        onClose={() => {}}
        {...moving}
      />,
    );
    expect(panel).toContain("Rebalancing Avengers");
    expect(panel).toContain('href="https://linear.app/shield/issue/AVG-11"');
    expect(panel).toContain("Delegate");
    expect(panel).toContain('aria-label="Wanda Maximoff would be: Sunny now."');
    expect(panel).toContain("Tony Stark goes from 2.75× to 2.5× the team average");
    // A forecast move says when the issue turns urgent, and which week's storm it heads off.
    expect(panel).toContain("urgent Nov 3");
    expect(panel).toContain('aria-label="Wanda Maximoff would be: Partly cloudy in week 3."');
  });

  it("hands each move over in one click, and offers to make all of today's at once", () => {
    const panel = renderToString(
      <RebalancePanel
        teamName="Avengers"
        rebalanceNow={[nowMove]}
        rebalanceForecast={[forecastMove]}
        onClose={() => {}}
        {...moving}
      />,
    );
    expect(panel).toContain('aria-label="Hand AVG-11 to Wanda Maximoff"');
    expect(panel).toContain('aria-label="Hand AVG-7 to Wanda Maximoff"');
    expect(panel.match(/Make all of today.s moves/g)).toHaveLength(1);
  });

  it("doesn't offer today's moves at once when there are none", () => {
    const panel = renderToString(
      <RebalancePanel
        teamName="Avengers"
        rebalanceNow={[]}
        rebalanceForecast={[forecastMove]}
        onClose={() => {}}
        {...moving}
      />,
    );
    expect(panel).not.toContain("Make all of today");
  });

  it("asks before making today's moves, listing who gets what in order", () => {
    const clint = { id: "u-clint", name: "Clint Barton", avatarUrl: null };
    const second = {
      ...nowMove,
      issue: { ...nowMove.issue, id: "i-12", identifier: "AVG-12" },
      to: clint,
    };
    const confirm = renderToString(
      <ConfirmMoves moves={[nowMove, second]} onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(confirm).toContain("Make these 2 moves in Linear?");
    const text = confirm.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toMatch(
      /AVG-11 .*Tony Stark .*Wanda Maximoff .*AVG-12 .*Tony Stark .*Clint Barton/,
    );
  });

  it("only asks to confirm today's moves while they're still the ones planned", () => {
    const clint = { id: "u-clint", name: "Clint Barton", avatarUrl: null };
    const second = { ...nowMove, issue: { ...nowMove.issue, id: "i-12" }, to: clint };
    expect(stillPlanned([nowMove, second], [nowMove, second])).toBe(true);
    // Replanned after a move: a fresh answer, same moves.
    expect(stillPlanned([nowMove, second], [{ ...nowMove }, { ...second }])).toBe(true);
    // The first was made meanwhile, one at a time.
    expect(stillPlanned([nowMove, second], [second])).toBe(false);
    // Planned again with a move more.
    expect(stillPlanned([nowMove], [nowMove, second])).toBe(false);
    // Another issue to the same person.
    expect(stillPlanned([second], [{ ...second, issue: nowMove.issue }])).toBe(false);
    // Same issue, someone else to take it now.
    expect(stillPlanned([second], [{ ...second, to: wanda }])).toBe(false);
  });

  it("finds who is running late, as their weather counts overdue work", () => {
    const people: PersonMatrix[] = [
      {
        assignee: tony,
        capacity: 1,
        timeOff: [],
        matrix: tonysMatrix,
        weather: { kind: "STORM", reason: "2 issues overdue", overdue: 2 },
        forecast: [],
      },
      {
        assignee: wanda,
        capacity: 1,
        timeOff: [],
        matrix: emptyMatrix,
        weather: { kind: "SUNNY", reason: "Nothing overdue", overdue: 0 },
        forecast: [],
      },
      {
        assignee: null,
        capacity: null,
        timeOff: null,
        matrix: tonysMatrix,
        weather: null,
        forecast: null,
      },
    ];
    expect(runningLate(people)).toEqual([{ person: tony, overdue: 2 }]);
    // Someone away hands on their overdue work too.
    const away = people.map((p) =>
      p.weather ? { ...p, weather: { ...p.weather, kind: "AWAY" as const } } : p,
    );
    expect(runningLate(away)).toEqual([]);
  });

  it("warns that moves can't clear a storm overdue work causes", () => {
    const panel = renderToString(
      <RebalancePanel
        teamName="Avengers"
        rebalanceNow={[nowMove]}
        rebalanceForecast={[]}
        runningLate={[
          { person: tony, overdue: 3 },
          { person: wanda, overdue: 1 },
        ]}
        onClose={() => {}}
        {...moving}
      />,
    );
    expect(panel).toContain(
      "Tony Stark (3 overdue) and Wanda Maximoff (1 overdue) stay in a storm after these moves",
    );
  });

  it("doesn't speak of moves when there are none", () => {
    const panel = renderToString(
      <RebalancePanel
        teamName="Avengers"
        rebalanceNow={[]}
        rebalanceForecast={[]}
        runningLate={[{ person: tony, overdue: 1 }]}
        onClose={() => {}}
        {...moving}
      />,
    );
    expect(panel).toContain("Tony Stark (1 overdue) stays in a storm: overdue work");
    expect(panel).not.toContain("after these moves");
  });

  it("says when there's nothing to move", () => {
    const panel = renderToString(
      <RebalancePanel
        teamName="Avengers"
        rebalanceNow={[]}
        rebalanceForecast={[]}
        onClose={() => {}}
        {...moving}
      />,
    );
    expect(panel).toContain("Nothing to move:");
    expect(panel).toContain("Nothing to move ahead of time");
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
      weather: { kind: "SUNNY" as const, reason: "Nothing urgent anywhere" },
      backlogRot: { rotting: false, reason: "No open issues" },
      rebalanceNow: [],
      rebalanceForecast: [],
      people: [
        {
          ...tony,
          capacity: 1,
          timeOff: [],
          matrix: emptyMatrix,
          weather: { kind: "SUNNY" as const, reason: "Nothing urgent", overdue: 0 },
          forecast: [],
        },
      ],
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
