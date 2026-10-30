import { env } from "cloudflare:workers";
import { graphql } from "graphql";
import { describe, expect, it } from "vitest";
// The web app keeps its query by its components; checking it here catches schema drift.
import { BOARD_QUERY } from "../../web/src/board";
import { Store } from "./db/store";
import { DEFAULT_RULES } from "./domain/quadrant";
import { LinearAuthError, LinearRateLimitError, type LinearSource } from "./linear/client";
import { DEMO_OPS_TEAM, DEMO_TEAM, DemoLinear } from "./linear/demo";
import { TeamsMembersDocument } from "./linear/generated";
import { type PlacementStore, Placements } from "./placements";
import { type GraphQLContext, schema } from "./schema";
import { Workspace } from "./workspace";

const today = "2026-10-18";

/**
 * Runs a query as someone signed in to the demo workspace (or signed out), with rules and
 * overrides from D1.
 */
function run(
  source: string,
  variables: Record<string, unknown> = {},
  {
    signedIn = true,
    linear = new DemoLinear({ today }) as LinearSource,
    store = new Store(env.DB) as PlacementStore,
    log = undefined as ((message: string, error: unknown) => void) | undefined,
  } = {},
) {
  const workspace = signedIn ? new Workspace(linear) : null;
  const contextValue: GraphQLContext = {
    workspace: async () => workspace,
    placements: new Placements(store, log),
    today,
  };
  return graphql({ schema, source, variableValues: variables, contextValue });
}

/** Runs a query that should succeed, and returns its data. */
async function data<T>(source: string, variables?: Record<string, unknown>): Promise<T> {
  const result = await run(source, variables);
  expect(result.errors).toBeUndefined();
  return result.data as T;
}

type Counts = Record<"do" | "schedule" | "delegate" | "drop", number>;

/** A store's writes, for a stand-in that only changes how it reads. */
function writesTo(store: Store): Omit<PlacementStore, "rules" | "overrides"> {
  return {
    setRules: (teamId, rules) => store.setRules(teamId, rules),
    setOverride: (issueId, quadrant) => store.setOverride(issueId, quadrant),
    clearOverride: (issueId) => store.clearOverride(issueId),
  };
}

describe("schema", () => {
  it("shows a team's people, each with their matrix, and the unassigned issues", async () => {
    const { team, ...rest } = await data<{
      today: string;
      team: {
        name: string;
        rules: unknown;
        people: { name: string; matrix: { counts: Counts; do: unknown[] } }[];
        unassigned: { counts: Counts };
      };
    }>(`{
      today
      team {
        name
        rules { importantFrom urgencyWindowDays noDueDate }
        people {
          name
          matrix {
            counts { do schedule delegate drop }
            do { identifier quadrant quadrantSource placementReason becomesUrgentOn }
          }
        }
        unassigned { counts { do schedule delegate drop } }
      }
    }`);
    expect(rest.today).toBe(today);
    expect(team.name).toBe("Avengers");
    expect(team.rules).toEqual({
      importantFrom: 3,
      urgencyWindowDays: 14,
      noDueDate: "NOT_URGENT",
    });
    expect(team.people.map((p) => p.name)).toEqual([
      "Bruce Banner",
      "Clint Barton",
      "Natasha Romanoff",
      "Steve Rogers",
      "Thor Odinson",
      "Tony Stark",
      "Wanda Maximoff",
    ]);
    const byName = new Map(team.people.map((p) => [p.name, p.matrix]));
    expect(byName.get("Tony Stark")?.counts).toEqual({ do: 9, schedule: 1, delegate: 2, drop: 1 });
    expect(byName.get("Tony Stark")?.do[0]).toEqual({
      identifier: "AVG-1",
      quadrant: "DO",
      quadrantSource: "RULE",
      placementReason: "Urgent priority, overdue by 5 days",
      becomesUrgentOn: today,
    });
    expect(byName.get("Wanda Maximoff")?.counts).toEqual({
      do: 0,
      schedule: 0,
      delegate: 0,
      drop: 0,
    });
    expect(Object.values(team.unassigned.counts).reduce((a, b) => a + b)).toBeGreaterThan(0);
  });

  it("finds the team asked for", async () => {
    const { team } = await data<{ team: unknown }>(
      "query ($id: ID) { team(id: $id) { id name } }",
      { id: DEMO_OPS_TEAM.id },
    );
    expect(team).toEqual({ id: DEMO_OPS_TEAM.id, name: "S.H.I.E.L.D. Ops" });
  });

  it("gives a matrix for the team asked for, and asks which team when it can't tell", async () => {
    const { team } = await data<{ team: { people: { name: string; matrix: unknown }[] } }>(
      "query ($teamId: ID) { team { people { name matrix(teamId: $teamId) { counts { do } } } } }",
      { teamId: DEMO_TEAM.id },
    );
    expect(team.people.find((p) => p.name === "Tony Stark")?.matrix).toEqual({
      counts: { do: 9 },
    });

    const { errors } = await run("{ viewer { matrix { counts { do } } } }");
    expect(errors?.map((e) => e.message)).toEqual(["Which team? Pass teamId."]);
  });

  it("links an issue to its assignee, whose workspace is the viewer's", async () => {
    const { team } = await data<{
      team: { people: { matrix: { do: { assignee: unknown }[] } }[] };
    }>("{ team { people { matrix { do { assignee { name organization { name } } } } } } }");
    expect(team.people.flatMap((p) => p.matrix.do)[0]?.assignee).toEqual({
      name: "Bruce Banner",
      organization: { name: "S.H.I.E.L.D." },
    });
  });

  it("is signed out without a session: no viewer, and an error for Linear data", async () => {
    const result = await run("{ viewer { name } teams { name } }", {}, { signedIn: false });
    expect(result.data).toEqual({ viewer: null, teams: null });
    expect(result.errors?.map((e) => e.extensions)).toEqual([{ code: "UNAUTHENTICATED" }]);
  });
});

describe("stored rules and overrides", () => {
  const tony = `{
    team {
      rules { urgencyWindowDays }
      people { name matrix { counts { do schedule delegate drop } drop { identifier quadrantSource placementReason } } }
    }
  }`;
  type Board = {
    team: {
      rules: { urgencyWindowDays: number };
      people: {
        name: string;
        matrix: { counts: Counts; drop: { identifier: string; quadrantSource: string }[] };
      }[];
    };
  };
  const tonyOf = (board: Board) => board.team.people.find((p) => p.name === "Tony Stark")?.matrix;

  it("puts an overridden issue where the PM put it", async () => {
    await new Store(env.DB).setOverride("demo-issue-avg-1", "drop");
    const matrix = tonyOf(await data<Board>(tony));
    expect(matrix?.counts).toEqual({ do: 8, schedule: 1, delegate: 2, drop: 2 });
    expect(matrix?.drop).toContainEqual({
      identifier: "AVG-1",
      quadrantSource: "OVERRIDE",
      placementReason: "Placed by hand; the rules say Do (Urgent priority, overdue by 5 days)",
    });
  });

  it("sorts by the team's stored rules", async () => {
    await new Store(env.DB).setRules(DEMO_TEAM.id, {
      importantFrom: 1,
      urgencyWindowDays: 1,
      noDueDate: "notUrgent",
    });
    const board = await data<Board>(tony);
    expect(board.team.rules).toEqual({ urgencyWindowDays: 1 });
    // Only Urgent priority is important now, and only today or overdue is urgent.
    expect(tonyOf(board)?.counts).toEqual({ do: 2, schedule: 2, delegate: 2, drop: 7 });
  });

  /** Counts the store reads a query makes. */
  async function storeReads(source: string) {
    const store = new Store(env.DB);
    const reads = { rules: 0, overrides: 0 };
    const counting: PlacementStore = {
      ...writesTo(store),
      rules: (teamIds) => {
        reads.rules++;
        return store.rules(teamIds);
      },
      overrides: (ids) => {
        reads.overrides++;
        return store.overrides(ids);
      },
    };
    const result = await run(source, {}, { store: counting });
    expect(result.errors).toBeUndefined();
    return reads;
  }

  it("reads rules and overrides once per request, however many people", async () => {
    expect(await storeReads(tony)).toEqual({ rules: 1, overrides: 1 });
  });

  it("reads rules and overrides once per request, however many teams", async () => {
    const everyTeam = `{ teams { rules { importantFrom } people { matrix { counts { do } } } } }`;
    expect(await storeReads(everyTeam)).toEqual({ rules: 1, overrides: 1 });
    // Unassigned matrices are reached a tick before people's, so they share a second read.
    const withUnassigned = `{
      teams { people { matrix { counts { do } } } unassigned { counts { do } } }
    }`;
    expect(await storeReads(withUnassigned)).toEqual({ rules: 1, overrides: 2 });
  });

  it("still shows the board by the default rules when the database fails", async () => {
    const down: PlacementStore = {
      ...writesTo(new Store(env.DB)),
      rules: () => Promise.reject(new Error("D1_ERROR: no such table: quadrant_rules")),
      overrides: () => Promise.reject(new Error("D1_ERROR: no such table: quadrant_override")),
    };
    const result = await run(tony, {}, { store: down, log: () => {} });
    expect(result.errors).toBeUndefined();
    const board = result.data as unknown as Board;
    expect(board.team.rules).toEqual({ urgencyWindowDays: 14 });
    expect(tonyOf(board)?.counts).toEqual({ do: 9, schedule: 1, delegate: 2, drop: 1 });
  });
});

describe("mutations", () => {
  const updateRules = `mutation ($teamId: ID!, $input: QuadrantRulesInput!) {
    updateQuadrantRules(teamId: $teamId, input: $input) {
      __typename
      ... on Error { message }
      ... on InvalidRules { problems { field message } }
      ... on TeamNotFound { teamId }
      ... on LinearRateLimited { resetAt }
      ... on UpdateRulesSuccess {
        team {
          rules { importantFrom urgencyWindowDays noDueDate }
          people { name matrix { counts { do schedule delegate drop } } }
        }
      }
    }
  }`;
  const strict = { importantFrom: 1, urgencyWindowDays: 1, noDueDate: "NOT_URGENT" };

  type RulesResult = {
    updateQuadrantRules: {
      __typename: string;
      message?: string;
      problems?: unknown[];
      team?: { rules: unknown; people: { name: string; matrix: { counts: Counts } }[] };
    };
  };
  const tonyCounts = (result: RulesResult) =>
    result.updateQuadrantRules.team?.people.find((p) => p.name === "Tony Stark")?.matrix.counts;

  it("changes a team's rules, and every matrix follows with no extra code", async () => {
    const result = await data<RulesResult>(updateRules, { teamId: DEMO_TEAM.id, input: strict });
    expect(result.updateQuadrantRules.__typename).toBe("UpdateRulesSuccess");
    expect(result.updateQuadrantRules.team?.rules).toEqual(strict);
    // By the defaults Tony has { do: 9, schedule: 1, delegate: 2, drop: 1 }.
    expect(tonyCounts(result)).toEqual({ do: 2, schedule: 2, delegate: 2, drop: 7 });

    // And it's kept: the next request sorts by the new rules too.
    const { team } = await data<{ team: { rules: unknown } }>(
      "{ team { rules { importantFrom urgencyWindowDays noDueDate } } }",
    );
    expect(team.rules).toEqual(strict);
  });

  it("refuses rules it couldn't sort by, saying what's wrong with each field", async () => {
    const result = await data<RulesResult>(updateRules, {
      teamId: DEMO_TEAM.id,
      input: { importantFrom: 0, urgencyWindowDays: 0, noDueDate: "URGENT" },
    });
    expect(result.updateQuadrantRules).toEqual({
      __typename: "InvalidRules",
      message:
        "Important from must be a priority: 1 (Urgent) to 4 (Low). The urgency window must be 1 to 365 whole days.",
      problems: [
        {
          field: "importantFrom",
          message: "Important from must be a priority: 1 (Urgent) to 4 (Low).",
        },
        { field: "urgencyWindowDays", message: "The urgency window must be 1 to 365 whole days." },
      ],
    });
    expect(await new Store(env.DB).rules([DEMO_TEAM.id])).toEqual(
      new Map([[DEMO_TEAM.id, DEFAULT_RULES]]),
    );
  });

  it("won't change the rules of a team the viewer can't see", async () => {
    const result = await data<RulesResult>(updateRules, { teamId: "someone-elses", input: strict });
    expect(result.updateQuadrantRules).toEqual({
      __typename: "TeamNotFound",
      message: "There's no such team, or you can't see it.",
      teamId: "someone-elses",
    });
  });

  it.each([
    { case: "signed out", options: { signedIn: false }, message: "Sign in with Linear first." },
    {
      case: "with a revoked Linear session",
      options: { linear: failingWith(new LinearAuthError("revoked")) },
      message: "Linear rejected the session; sign in again.",
    },
  ])("is Unauthorized $case, and saves nothing", async ({ options, message }) => {
    const result = await run(updateRules, { teamId: DEMO_TEAM.id, input: strict }, options);
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ updateQuadrantRules: { __typename: "Unauthorized", message } });
    expect(await new Store(env.DB).rules([DEMO_TEAM.id])).toEqual(
      new Map([[DEMO_TEAM.id, DEFAULT_RULES]]),
    );
  });

  it("says when Linear's rate limit is spent, and when it's back", async () => {
    const resetAt = Date.UTC(2026, 9, 18, 12, 30);
    const result = await run(
      updateRules,
      { teamId: DEMO_TEAM.id, input: strict },
      { linear: failingWith(new LinearRateLimitError(resetAt)) },
    );
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      updateQuadrantRules: {
        __typename: "LinearRateLimited",
        message: "Linear's rate limit is spent for now; try again later.",
        resetAt: "2026-10-18T12:30:00.000Z",
      },
    });
  });

  it("still says the rules were saved when Linear fails on what's derived from them", async () => {
    const demo = new DemoLinear({ today });
    const limitedOnMembers: LinearSource = {
      request: (document, ...variables) =>
        document.toString() === TeamsMembersDocument.toString()
          ? Promise.reject(new LinearRateLimitError(null))
          : demo.request(document, ...variables),
    };
    const result = await run(
      updateRules,
      { teamId: DEMO_TEAM.id, input: strict },
      { linear: limitedOnMembers },
    );
    expect(result.data).toMatchObject({
      updateQuadrantRules: { __typename: "UpdateRulesSuccess", team: { people: null } },
    });
    expect(result.errors?.map((e) => e.path)).toEqual([["updateQuadrantRules", "team", "people"]]);
    expect((await new Store(env.DB).rules([DEMO_TEAM.id])).get(DEMO_TEAM.id)).toMatchObject({
      importantFrom: 1,
      urgencyWindowDays: 1,
    });
  });

  it("leaves other failures, like the database's, to top-level errors", async () => {
    const store = new Store(env.DB);
    const broken: PlacementStore = {
      rules: (teamIds) => store.rules(teamIds),
      overrides: (ids) => store.overrides(ids),
      ...writesTo(store),
      setRules: () => Promise.reject(new Error("D1_ERROR: database is locked")),
    };
    const result = await run(
      updateRules,
      { teamId: DEMO_TEAM.id, input: strict },
      { store: broken },
    );
    expect(result.data).toEqual({ updateQuadrantRules: null });
    expect(result.errors?.map((e) => e.message)).toEqual(["D1_ERROR: database is locked"]);
  });

  const placement = `
    __typename
    ... on Error { message }
    ... on IssueNotFound { issueId }
    ... on OverrideSuccess {
      issue { identifier quadrant quadrantSource placementReason }
      team { people { name matrix { counts { do drop } } } }
    }
  `;
  type PlacementResult = {
    __typename: string;
    issue?: { quadrant: string; quadrantSource: string };
    team?: { people: { name: string; matrix: { counts: Partial<Counts> } }[] };
  };
  const tonyIn = (result: PlacementResult) =>
    result.team?.people.find((p) => p.name === "Tony Stark")?.matrix.counts;

  it("places an issue by hand and hands it back, each answer showing the matrix after", async () => {
    // Both in one request: the second must not read what the first cached.
    const { moved, back } = await data<{ moved: PlacementResult; back: PlacementResult }>(
      `mutation ($id: ID!) {
        moved: overrideQuadrant(issueId: $id, quadrant: DROP) { ${placement} }
        back: clearOverride(issueId: $id) { ${placement} }
      }`,
      { id: "demo-issue-avg-1" },
    );
    expect(moved.issue).toEqual({
      identifier: "AVG-1",
      quadrant: "DROP",
      quadrantSource: "OVERRIDE",
      placementReason: "Placed by hand; the rules say Do (Urgent priority, overdue by 5 days)",
    });
    expect(tonyIn(moved)).toEqual({ do: 8, drop: 2 });
    expect(back.issue).toEqual({
      identifier: "AVG-1",
      quadrant: "DO",
      quadrantSource: "RULE",
      placementReason: "Urgent priority, overdue by 5 days",
    });
    expect(tonyIn(back)).toEqual({ do: 9, drop: 1 });
    expect(await new Store(env.DB).overrides(["demo-issue-avg-1"])).toEqual(new Map());
  });

  it("keeps a hand placement for later requests", async () => {
    await data(
      `mutation { overrideQuadrant(issueId: "demo-issue-ops-1", quadrant: SCHEDULE) { __typename } }`,
    );
    expect(await new Store(env.DB).overrides(["demo-issue-ops-1"])).toEqual(
      new Map([["demo-issue-ops-1", "schedule"]]),
    );
  });

  it("won't place an issue the viewer can't see", async () => {
    const { overrideQuadrant } = await data<{ overrideQuadrant: PlacementResult }>(
      `mutation { overrideQuadrant(issueId: "someone-elses", quadrant: DO) { ${placement} } }`,
    );
    expect(overrideQuadrant).toEqual({
      __typename: "IssueNotFound",
      message: "There's no such issue, or you can't see it.",
      issueId: "someone-elses",
    });
    expect(await new Store(env.DB).overrides(["someone-elses"])).toEqual(new Map());
  });
});

/** A Linear that fails every request this way. */
function failingWith(error: Error): LinearSource {
  return { request: () => Promise.reject(error) };
}

describe("the web app's board query", () => {
  it("is valid against the schema and loads the demo board", async () => {
    const board = await data<{ viewer: unknown; team: unknown }>(BOARD_QUERY, { teamId: null });
    expect(board.viewer).toMatchObject({ name: "Nick Fury" });
    expect(board.team).toMatchObject({ name: "Avengers" });
  });
});

describe("Linear requests per query", () => {
  /** The operations a query sends to Linear, by name. */
  async function linearRequests(source: string, variables: Record<string, unknown> = {}) {
    const demo = new DemoLinear({ today });
    const sent: string[] = [];
    const counting: LinearSource = {
      request: (document, ...rest) => {
        sent.push(/\bquery (\w+)/.exec(document.toString())?.[1] ?? "?");
        return demo.request(document, ...rest);
      },
    };
    // One Workspace per GraphQL request, as the server makes it.
    const workspace = new Workspace(counting);
    const result = await graphql({
      schema,
      source,
      variableValues: variables,
      contextValue: {
        workspace: async () => workspace,
        placements: new Placements(new Store(env.DB)),
        today,
      } satisfies GraphQLContext,
    });
    expect(result.errors).toBeUndefined();
    return sent.toSorted();
  }

  it("loads the board in one request per kind of data, however many people are on it", async () => {
    expect(await linearRequests(BOARD_QUERY, { teamId: null })).toEqual([
      "OpenIssues",
      "Teams",
      "TeamsMembers",
      "Viewer",
    ]);
  });

  it("batches every team's members and issues into one request each", async () => {
    const everyTeam = `{
      teams { people { matrix { counts { do } } } unassigned { counts { do } } }
    }`;
    expect(await linearRequests(everyTeam)).toEqual(["OpenIssues", "Teams", "TeamsMembers"]);
  });
});
