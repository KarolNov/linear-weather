import { env } from "cloudflare:workers";
import { graphql } from "graphql";
import { describe, expect, it } from "vitest";
// The web app's operations, typed by codegen against schema.graphql; running them here checks
// they also load what the board expects.
import {
  BOARD_QUERY,
  QUADRANTS,
  type TeamBoardData,
  MAX_TIME_OFF as WEB_MAX_TIME_OFF,
  MAX_URGENCY_WINDOW_DAYS as WEB_MAX_URGENCY_WINDOW_DAYS,
} from "../../web/src/board";
import type { QuadrantRulesInput, TypedDocumentString } from "../../web/src/generated";
import {
  ADD_TIME_OFF_MUTATION,
  CLEAR_OVERRIDE_MUTATION,
  OVERRIDE_MUTATION,
  REASSIGN_MUTATION,
  REMOVE_TIME_OFF_MUTATION,
  SET_CAPACITY_MUTATION,
  TEAM_QUERY,
  UPDATE_RULES_MUTATION,
} from "../../web/src/mutations";
import { Store } from "./db/store";
import { DEFAULT_RULES, MAX_URGENCY_WINDOW_DAYS } from "./domain/quadrant";
import { MAX_TIME_OFF } from "./domain/time-off";
import {
  LinearAuthError,
  LinearForbiddenError,
  LinearInvalidInputError,
  LinearRateLimitError,
  type LinearSource,
} from "./linear/client";
import { DEMO_OPS_TEAM, DEMO_TEAM, DemoLinear } from "./linear/demo";
import { IssueByIdDocument, ReassignIssueDocument, TeamsMembersDocument } from "./linear/generated";
import { type PlacementStore, Placements } from "./placements";
import { type GraphQLContext, schema } from "./schema";
import { Workspace } from "./workspace";

const today = "2026-10-18";

/** An operation: a string, or one of web's generated documents, typed by what it answers. */
type Operation<TResult = unknown, TVariables = never> =
  | string
  | TypedDocumentString<TResult, TVariables>;

/**
 * Runs a query as someone signed in to the demo workspace (or signed out), with rules and
 * overrides from D1.
 */
function run(
  operation: Operation,
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
  return graphql({ schema, source: operation.toString(), variableValues: variables, contextValue });
}

/** Runs a query that should succeed, and returns its data: a document's typed result. */
async function data<TResult, TVariables>(
  operation: TypedDocumentString<TResult, TVariables>,
  variables?: TVariables,
): Promise<TResult>;
async function data<T>(operation: string, variables?: Record<string, unknown>): Promise<T>;
async function data(operation: Operation, variables?: object): Promise<unknown> {
  const result = await run(operation, variables as Record<string, unknown> | undefined);
  expect(result.errors).toBeUndefined();
  return result.data;
}

type Counts = Record<"do" | "schedule" | "delegate" | "drop", number>;

/** A store's writes and capacities, for a stand-in that only changes how it reads placements. */
function writesTo(store: Store): Omit<PlacementStore, "rules" | "overrides"> {
  return {
    setRules: (teamId, rules) => store.setRules(teamId, rules),
    setOverride: (issueId, quadrant) => store.setOverride(issueId, quadrant),
    clearOverride: (issueId) => store.clearOverride(issueId),
    capacities: (userIds) => store.capacities(userIds),
    setCapacity: (userId, factor) => store.setCapacity(userId, factor),
    timeOff: (userIds) => store.timeOff(userIds),
    addTimeOff: (userId, startsOn, endsOn, today) =>
      store.addTimeOff(userId, startsOn, endsOn, today),
    removeTimeOff: (userId, id) => store.removeTimeOff(userId, id),
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

  it("gives each person their weather against the team's average, and the team its spread", async () => {
    const { team } = await data<{
      team: {
        loadMetric: string;
        weather: { kind: string; reason: string };
        people: { name: string; weather: { kind: string; load: number | null; reason: string } }[];
      };
    }>(`{
      team {
        loadMetric
        weather { kind reason }
        people { name weather { kind load reason } }
      }
    }`);
    // Some urgent Avengers issues aren't estimated, so load is in issues:
    // (6 + 1 + 4 + 2 + 11 + 0) / 6 = 4, Thor left out.
    expect(team.loadMetric).toBe("ISSUES");
    expect(Object.fromEntries(team.people.map((p) => [p.name, p.weather]))).toEqual({
      "Bruce Banner": { kind: "RAIN", load: 6, reason: "6 urgent issues, 1.5× the team average" },
      "Clint Barton": {
        kind: "SUNNY",
        load: 1,
        reason: "1 urgent issue, 0.25× the team average",
      },
      "Natasha Romanoff": {
        kind: "STORM",
        load: 4,
        reason: "4 urgent issues, 1.0× the team average; 1 issue overdue",
      },
      "Steve Rogers": { kind: "SUNNY", load: 2, reason: "2 urgent issues, 0.5× the team average" },
      "Thor Odinson": {
        kind: "FOG",
        load: null,
        reason: "Nothing urgent, but some work has no due date",
      },
      "Tony Stark": {
        kind: "STORM",
        load: 11,
        reason: "11 urgent issues, 2.75× the team average; 3 issues overdue",
      },
      "Wanda Maximoff": { kind: "SUNNY", load: 0, reason: "Nothing urgent" },
    });
    expect(team.weather).toEqual({
      kind: "STORM",
      reason: "Natasha Romanoff and Tony Stark are in a storm",
    });
  });

  it("counts weather in points when asked, leaving out anyone with unestimated urgent work", async () => {
    const { team } = await data<{
      team: {
        weather: { metric: string };
        people: { name: string; weather: { kind: string; load: number | null } }[];
      };
    }>(`{
      team {
        weather(metric: POINTS) { metric }
        people { name weather(metric: POINTS) { kind load } }
      }
    }`);
    expect(team.weather.metric).toBe("POINTS");
    const byName = Object.fromEntries(team.people.map((p) => [p.name, p.weather]));
    expect(byName["Bruce Banner"]).toEqual({ kind: "FOG", load: null });
    expect(byName["Natasha Romanoff"]).toEqual({ kind: "STORM", load: 17 });
  });

  it("is fog for someone outside the team", async () => {
    const { team } = await data<{
      team: { people: { name: string; weather: { kind: string; reason: string } }[] };
    }>(`query ($ops: ID) { team { people { name weather(teamId: $ops) { kind reason } } } }`, {
      ops: DEMO_OPS_TEAM.id,
    });
    expect(team.people.find((p) => p.name === "Wanda Maximoff")?.weather).toEqual({
      kind: "FOG",
      reason: "Not on this team",
    });
  });

  it("forecasts each person's weather week by week, and the team's worst week", async () => {
    type Week = {
      startsOn: string;
      weather: { kind: string; load: number | null };
      summary: string;
      turningUrgent: { identifier: string }[];
    };
    const { team } = await data<{
      team: {
        forecast: { weeks: { weather: { kind: string } }[]; worst: { startsOn: string } };
        people: { name: string; forecast: Week[] }[];
      };
    }>(`{
      team {
        forecast { weeks { weather { kind } } worst { startsOn } }
        people {
          name
          forecast { startsOn weather { kind load } summary turningUrgent { identifier } }
        }
      }
    }`);
    const byName = Object.fromEntries(team.people.map((p) => [p.name, p.forecast]));
    const bruce = byName["Bruce Banner"] ?? [];
    expect(bruce.map((w) => w.startsOn)).toEqual([
      "2026-10-18",
      "2026-10-25",
      "2026-11-01",
      "2026-11-08",
    ]);
    // Three more turn urgent this week, then his work comes due and leaves.
    expect(bruce.map((w) => [w.weather.kind, w.weather.load])).toEqual([
      ["STORM", 6],
      ["STORM", 4],
      ["SUNNY", 0],
      ["SUNNY", 0],
    ]);
    expect(bruce[0]?.turningUrgent.map((i) => i.identifier)).toEqual([
      "AVG-31",
      "AVG-32",
      "AVG-33",
    ]);
    expect(bruce[0]?.summary).toBe(
      "1 Urgent-priority issue, 1 High-priority issue and 1 Medium-priority issue become urgent",
    );
    // Clint's one dated issue comes due; what's left has no date.
    expect(byName["Clint Barton"]?.map((w) => w.weather.kind)).toEqual([
      "SUNNY",
      "FOG",
      "FOG",
      "FOG",
    ]);
    expect(team.forecast.weeks.map((w) => w.weather.kind)).toEqual([
      "STORM",
      "STORM",
      "STORM",
      "STORM",
    ]);
    expect(team.forecast.worst.startsOn).toBe("2026-10-18");
  });

  it("forecasts as far ahead as asked, within limits", async () => {
    const { team } = await data<{ team: { people: { forecast: unknown[] }[] } }>(
      "{ team { people { forecast(weeks: 2) { startsOn } } } }",
    );
    expect(team.people[0]?.forecast).toHaveLength(2);
    const result = await run("{ team { forecast(weeks: 13) { worst { startsOn } } } }");
    expect(result.errors?.map((e) => [e.message, e.extensions])).toEqual([
      ["A forecast covers 1 to 12 weeks.", { code: "BAD_USER_INPUT" }],
    ]);
  });

  it("forecasts fog for someone outside the team", async () => {
    const { team } = await data<{
      team: { people: { name: string; forecast: { weather: { kind: string } }[] }[] };
    }>(
      `query ($ops: ID) { team { people { name forecast(teamId: $ops) { weather { kind } } } } }`,
      {
        ops: DEMO_OPS_TEAM.id,
      },
    );
    const wanda = team.people.find((p) => p.name === "Wanda Maximoff");
    expect(wanda?.forecast.map((w) => w.weather.kind)).toEqual(["FOG", "FOG", "FOG", "FOG"]);
  });

  it("suggests moves that even out urgent load, now and before forecast storms", async () => {
    type Suggestion = {
      issue: { identifier: string; quadrant: string };
      from: { name: string };
      to: { name: string };
      week: number | null;
      fromWeather: string;
      toWeather: string;
      reason: string;
    };
    const fields =
      "issue { identifier quadrant } from { name } to { name } week fromWeather toWeather reason";
    const { team } = await data<{ team: { now: Suggestion[]; forecast: Suggestion[] } }>(`{
      team {
        now: rebalanceSuggestions(horizon: NOW) { ${fields} }
        forecast: rebalanceSuggestions(horizon: FORECAST) { ${fields} }
      }
    }`);
    // Tony carries most of today's urgent work; Wanda, with nothing urgent, takes the first.
    expect(team.now[0]).toEqual({
      issue: { identifier: "AVG-11", quadrant: "DELEGATE" },
      from: { name: "Tony Stark" },
      to: { name: "Wanda Maximoff" },
      week: null,
      // Still a storm: his overdue work stays with him.
      fromWeather: "STORM",
      toWeather: "SUNNY",
      reason:
        "Tony Stark goes from 2.75× to 2.5× the team average, Wanda Maximoff from 0.0× to 0.25×",
    });
    expect(team.now.every(({ week }) => week === null)).toBe(true);
    // Forecast moves only work not urgent yet, ahead of the week it would storm, on the board
    // today's moves leave: Wanda has taken some of Tony's, so Steve is the one free now.
    expect(team.forecast[0]).toMatchObject({
      issue: { identifier: "AVG-33", quadrant: "SCHEDULE" },
      from: { name: "Bruce Banner" },
      to: { name: "Steve Rogers" },
      week: 1,
    });
    // Week by week, each settled before the next.
    const weeks = team.forecast.map(({ week }) => week ?? 0);
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b));
    expect(
      team.forecast.every(
        ({ issue }) => issue.quadrant === "SCHEDULE" || issue.quadrant === "DROP",
      ),
    ).toBe(true);
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
      dropAlertPercent: 40,
      awayStatuses: [],
    });
    const board = await data<Board>(tony);
    expect(board.team.rules).toEqual({ urgencyWindowDays: 1 });
    // Only Urgent priority is important now, and only today or overdue is urgent.
    expect(tonyOf(board)?.counts).toEqual({ do: 2, schedule: 2, delegate: 2, drop: 7 });
  });

  it("flags backlog rot across the team, its unassigned issues included", async () => {
    type Rot = {
      team: {
        backlogRot: { drop: number; rotting: boolean; reason: string };
        people: { matrix: { counts: Counts } }[];
        unassigned: { counts: Counts };
      };
    };
    const rot = `{ team {
      backlogRot { drop rotting reason }
      people { matrix { counts { do schedule delegate drop } } }
      unassigned { counts { do schedule delegate drop } }
    } }`;
    const { team } = await data<Rot>(rot);
    expect(team.unassigned.counts.drop).toBeGreaterThan(0);
    expect(team.backlogRot).toEqual({
      drop:
        team.people.reduce((n, { matrix }) => n + matrix.counts.drop, 0) +
        team.unassigned.counts.drop,
      rotting: false,
      reason: "8 of 47 open issues (17%) are in Drop, within the team's 40% alert",
    });

    await new Store(env.DB).setRules(DEMO_TEAM.id, { ...DEFAULT_RULES, dropAlertPercent: 15 });
    expect((await data<Rot>(rot)).team.backlogRot).toMatchObject({
      rotting: true,
      reason: "8 of 47 open issues (17%) are in Drop, over the team's 15% alert",
    });
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
      capacities: () => Promise.reject(new Error("D1_ERROR: no such table: member_capacity")),
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

  it("sets the Drop alert, and keeps it when the input leaves it out", async () => {
    const alertOf = async () =>
      (
        await data<{ team: { rules: { dropAlertPercent: number } } }>(
          "{ team { rules { dropAlertPercent } } }",
        )
      ).team.rules.dropAlertPercent;
    expect(await alertOf()).toBe(40);
    await data(updateRules, { teamId: DEMO_TEAM.id, input: { ...strict, dropAlertPercent: 25 } });
    expect(await alertOf()).toBe(25);
    await data(updateRules, { teamId: DEMO_TEAM.id, input: strict });
    expect(await alertOf()).toBe(25);
  });

  it("refuses a Drop alert outside 1 to 99", async () => {
    const result = await data<RulesResult>(updateRules, {
      teamId: DEMO_TEAM.id,
      input: { ...strict, dropAlertPercent: 100 },
    });
    expect(result.updateQuadrantRules.problems).toEqual([
      { field: "dropAlertPercent", message: "The Drop alert must be 1 to 99 whole percent." },
    ]);
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
    // Nothing on the way up is nullable, so the board is lost; the error's path says where.
    expect(result.data).toBeNull();
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
    expect(result.data).toBeNull();
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

describe("away statuses", () => {
  const setStatuses = `mutation ($teamId: ID!, $input: QuadrantRulesInput!) {
    updateQuadrantRules(teamId: $teamId, input: $input) {
      __typename
      ... on InvalidRules { problems { field message } }
      ... on UpdateRulesSuccess {
        team {
          rules { awayStatuses dropAlertPercent }
          weather { kind reason }
          people { name weather { kind reason } forecast(weeks: 2) { weather { kind reason } } }
        }
      }
    }
  }`;
  const defaults = { importantFrom: 3, urgencyWindowDays: 14, noDueDate: "NOT_URGENT" };
  type Result = {
    updateQuadrantRules: {
      __typename: string;
      problems?: { field: string; message: string }[];
      team?: {
        rules: { awayStatuses: string[]; dropAlertPercent: number };
        weather: { kind: string; reason: string };
        people: {
          name: string;
          weather: { kind: string; reason: string };
          forecast: { weather: { kind: string; reason: string } }[];
        }[];
      };
    };
  };

  it("leaves everyone present until the team lists a status", async () => {
    const { team } = await data<{
      team: {
        rules: { awayStatuses: string[] };
        people: { name: string; weather: { kind: string } }[];
      };
    }>("{ team { rules { awayStatuses } people { name weather { kind } } } }");
    expect(team.rules.awayStatuses).toEqual([]);
    expect(team.people.find((p) => p.name === "Clint Barton")?.weather.kind).not.toBe("AWAY");
  });

  it("marks someone away by their Linear status, naming it", async () => {
    // Clint's 🌴 On vacation clears on the evening of Oct 20 in New York.
    const { updateQuadrantRules: result } = await data<Result>(setStatuses, {
      teamId: DEMO_TEAM.id,
      input: { ...defaults, awayStatuses: [" vacation ", "VACATION"] },
    });
    expect(result.__typename).toBe("UpdateRulesSuccess");
    expect(result.team?.rules).toEqual({ awayStatuses: ["vacation"], dropAlertPercent: 40 });
    expect(result.team?.people.find((p) => p.name === "Clint Barton")?.weather).toEqual({
      kind: "AWAY",
      reason: "Away until Oct 20 (Linear status 🌴 On vacation), holding 1 urgent issue",
    });
    expect(result.team?.weather.kind).toBe("STORM");
    expect(result.team?.weather.reason).toContain("Clint Barton is away with 1 urgent issue");
    // Off Monday and Tuesday of the first week, there the rest of it; all of the second.
    const weeks = result.team?.people.find((p) => p.name === "Clint Barton")?.forecast;
    expect(weeks?.[0]?.weather.kind).not.toBe("AWAY");
    expect(weeks?.[0]?.weather.reason).toContain("(2 days off: Linear status 🌴 On vacation)");
    expect(weeks?.[1]?.weather.reason).not.toContain("days off");

    // Left out of the input, they stay.
    const { updateQuadrantRules: kept } = await data<Result>(setStatuses, {
      teamId: DEMO_TEAM.id,
      input: { ...defaults, dropAlertPercent: 30 },
    });
    expect(kept.team?.rules).toEqual({ awayStatuses: ["vacation"], dropAlertPercent: 30 });
  });

  it("refuses too many away statuses", async () => {
    const { updateQuadrantRules: result } = await data<Result>(setStatuses, {
      teamId: DEMO_TEAM.id,
      input: { ...defaults, awayStatuses: Array.from({ length: 11 }, (_, i) => `s${i}`) },
    });
    expect(result).toEqual({
      __typename: "InvalidRules",
      problems: [{ field: "awayStatuses", message: "List at most 10 away statuses." }],
    });
  });
});

describe("time off", () => {
  const addTimeOff = `mutation ($teamId: ID!, $userId: ID!, $startsOn: Date!, $endsOn: Date!) {
    addTimeOff(teamId: $teamId, userId: $userId, startsOn: $startsOn, endsOn: $endsOn) {
      __typename
      ... on Error { message }
      ... on TimeOffSuccess {
        user { name timeOff { id startsOn endsOn } }
        team { weather { kind reason } people { name weather { kind reason } } }
      }
    }
  }`;
  const removeTimeOff = `mutation ($teamId: ID!, $userId: ID!, $timeOffId: ID!) {
    removeTimeOff(teamId: $teamId, userId: $userId, timeOffId: $timeOffId) {
      __typename
      ... on Error { message }
      ... on TimeOffSuccess { user { timeOff { id } } team { weather { kind } } }
    }
  }`;
  type Success = {
    __typename: string;
    message?: string;
    user?: { name: string; timeOff: { id: string; startsOn: string; endsOn: string }[] };
    team?: {
      weather: { kind: string; reason: string };
      people: { name: string; weather: { kind: string; reason: string } }[];
    };
  };
  const natasha = "demo-user-natasha";

  it("marks someone away today, leaving their urgent work to storm the team", async () => {
    // Oct 18 is a Sunday; she's back after the week.
    const { addTimeOff: added } = await data<{ addTimeOff: Success }>(addTimeOff, {
      teamId: DEMO_TEAM.id,
      userId: natasha,
      startsOn: "2026-10-16",
      endsOn: "2026-10-23",
    });
    expect(added.__typename).toBe("TimeOffSuccess");
    expect(added.user?.timeOff).toEqual([
      { id: expect.any(String), startsOn: "2026-10-16", endsOn: "2026-10-23" },
    ]);
    expect(added.team?.people.find((p) => p.name === "Natasha Romanoff")?.weather).toEqual({
      kind: "AWAY",
      reason: "Away until Oct 23, holding 4 urgent issues (1 overdue)",
    });
    expect(added.team?.weather.kind).toBe("STORM");
    expect(added.team?.weather.reason).toContain("Natasha Romanoff is away with 4 urgent issues");

    // Her work goes first.
    const { team } = await data<{
      team: { rebalanceSuggestions: { from: { name: string }; reason: string }[] };
    }>(`{ team { rebalanceSuggestions(horizon: NOW) { from { name } reason } } }`);
    const first = team.rebalanceSuggestions.slice(0, 4);
    expect(first.map(({ from }) => from.name)).toEqual(Array(4).fill("Natasha Romanoff"));
    expect(first[0]?.reason).toMatch(/^Natasha Romanoff is away until Oct 23; /);

    // Taken back.
    const id = added.user?.timeOff[0]?.id;
    const { removeTimeOff: removed } = await data<{ removeTimeOff: Success }>(removeTimeOff, {
      teamId: DEMO_TEAM.id,
      userId: natasha,
      timeOffId: id,
    });
    expect(removed.__typename).toBe("TimeOffSuccess");
    expect(removed.user?.timeOff).toEqual([]);
    const again = await data<{ removeTimeOff: Success }>(removeTimeOff, {
      teamId: DEMO_TEAM.id,
      userId: natasha,
      timeOffId: id,
    });
    expect(again.removeTimeOff).toEqual({
      __typename: "TimeOffNotFound",
      message: "Natasha Romanoff has no such time off; it may be gone already.",
    });
  });

  it("lists only time off not over yet, the same on every team", async () => {
    const store = new Store(env.DB);
    await store.addTimeOff(natasha, "2026-10-01", "2026-10-02", "2026-10-01");
    await store.addTimeOff(natasha, "2026-12-21", "2026-12-31", "2026-10-01");
    const { team } = await data<{
      team: { people: { name: string; timeOff: { startsOn: string }[] }[] };
    }>("query ($id: ID) { team(id: $id) { people { name timeOff { startsOn } } } }", {
      id: DEMO_OPS_TEAM.id,
    });
    expect(team.people.find((p) => p.name === "Natasha Romanoff")?.timeOff).toEqual([
      { startsOn: "2026-12-21" },
    ]);
  });

  it("refuses more stretches coming up than the board holds", async () => {
    const store = new Store(env.DB);
    for (let i = 0; i < MAX_TIME_OFF; i++) {
      await store.addTimeOff(natasha, `2026-11-${10 + i}`, `2026-11-${10 + i}`, "2026-10-18");
    }
    const { addTimeOff: result } = await data<{ addTimeOff: Success }>(addTimeOff, {
      teamId: DEMO_TEAM.id,
      userId: natasha,
      startsOn: "2026-12-01",
      endsOn: "2026-12-01",
    });
    expect(result).toEqual({
      __typename: "InvalidTimeOff",
      message: `Natasha Romanoff has ${MAX_TIME_OFF} stretches of time off coming up already; remove one first.`,
    });
  });

  it.each([
    [{ endsOn: "2026-10-01" }, "InvalidTimeOff", "Time off can't end before it starts."],
    [
      { startsOn: "2026-10-01", endsOn: "2026-10-17" },
      "InvalidTimeOff",
      "That time off is already over.",
    ],
    [{ userId: "demo-user-maria" }, "UserNotFound", "There's nobody with that id on Avengers."],
    [{ teamId: "team-nobody" }, "TeamNotFound", "There's no such team, or you can't see it."],
  ])("refuses %o", async (bad, typename, message) => {
    const { addTimeOff: result } = await data<{ addTimeOff: Success }>(addTimeOff, {
      teamId: DEMO_TEAM.id,
      userId: natasha,
      startsOn: "2026-10-19",
      endsOn: "2026-10-23",
      ...bad,
    });
    expect(result).toEqual({ __typename: typename, message });
    expect(await new Store(env.DB).timeOff([natasha])).toEqual(new Map());
  });
});

describe("capacity", () => {
  const setCapacity = `mutation ($teamId: ID!, $userId: ID!, $factor: Float!) {
    setCapacity(teamId: $teamId, userId: $userId, factor: $factor) {
      __typename
      ... on Error { message }
      ... on SetCapacitySuccess {
        user { name capacity }
        team { people { name capacity weather { kind reason } } }
      }
    }
  }`;
  type Result = {
    setCapacity: {
      __typename: string;
      message?: string;
      user?: { name: string; capacity: number };
      team?: { people: { name: string; capacity: number; weather: { reason: string } }[] };
    };
  };
  const natasha = "demo-user-natasha";

  it("is full time until set", async () => {
    const { team } = await data<{ team: { people: { capacity: number }[] } }>(
      "{ team { people { capacity } } }",
    );
    expect(team.people.every(({ capacity }) => capacity === 1)).toBe(true);
  });

  it("weighs someone's weather by their capacity, on every team they're on", async () => {
    const { setCapacity: result } = await data<Result>(setCapacity, {
      teamId: DEMO_TEAM.id,
      userId: natasha,
      factor: 0.5,
    });
    expect(result.__typename).toBe("SetCapacitySuccess");
    expect(result.user).toEqual({ name: "Natasha Romanoff", capacity: 0.5 });
    // 24 urgent issues over 5.5 people: Natasha's share is 2.18.
    expect(result.team?.people.find((p) => p.name === "Natasha Romanoff")).toMatchObject({
      capacity: 0.5,
      weather: { reason: "4 urgent issues at half time, 1.83× their share; 1 issue overdue" },
    });

    // Kept, and the same on her other team.
    const { team } = await data<{ team: { people: { name: string; capacity: number }[] } }>(
      "query ($id: ID) { team(id: $id) { people { name capacity } } }",
      { id: DEMO_OPS_TEAM.id },
    );
    expect(team.people.find((p) => p.name === "Natasha Romanoff")?.capacity).toBe(0.5);

    // Back to full time.
    const back = await data<Result>(setCapacity, {
      teamId: DEMO_TEAM.id,
      userId: natasha,
      factor: 1,
    });
    expect(back.setCapacity.user?.capacity).toBe(1);
  });

  it.each([
    [{ factor: 0 }, "InvalidCapacity", "Capacity is a share of full time: more than 0, up to 1."],
    [{ factor: 1.5 }, "InvalidCapacity", "Capacity is a share of full time: more than 0, up to 1."],
    [{ userId: "demo-user-maria" }, "UserNotFound", "There's nobody with that id on Avengers."],
    [{ teamId: "team-nobody" }, "TeamNotFound", "There's no such team, or you can't see it."],
  ])("refuses %o", async (bad, typename, message) => {
    const { setCapacity: result } = await data<Result>(setCapacity, {
      teamId: DEMO_TEAM.id,
      userId: natasha,
      factor: 0.5,
      ...bad,
    });
    expect(result).toEqual({ __typename: typename, message });
    const { team } = await data<{ team: { people: { capacity: number }[] } }>(
      "{ team { people { capacity } } }",
    );
    expect(team.people.every(({ capacity }) => capacity === 1)).toBe(true);
  });
});

describe("reassigning", () => {
  const reassign = `mutation ($issueId: ID!, $userId: ID!) {
    reassignIssue(issueId: $issueId, userId: $userId) {
      __typename
      ... on Error { message }
      ... on IssueNotFound { issueId }
      ... on LinearRateLimited { resetAt }
      ... on ReassignSuccess {
        issue { identifier quadrant assignee { name } }
        team { ${LOADS} }
      }
    }
  }`;
  type ReassignResult = {
    reassignIssue: {
      __typename: string;
      message?: string;
      issueId?: string;
      issue?: { identifier: string; quadrant: string; assignee: { name: string } | null };
      team?: Loads;
    };
  };

  it("hands an issue to someone else, and their weather and forecast follow", async () => {
    const linear = new DemoLinear({ today });
    const before = await run(`{ team { ${LOADS} } }`, {}, { linear });
    expect(loadOf((before.data as { team: Loads }).team, "Wanda Maximoff")).toEqual({
      now: 0,
      week1: 0,
    });
    expect(loadOf((before.data as { team: Loads }).team, "Tony Stark")).toEqual({
      now: 11,
      week1: 6,
    });

    // AVG-10, "Replace the repulsor gloves' firmware": Tony's, High priority, due in 9 days.
    const result = await run(
      reassign,
      { issueId: "demo-issue-avg-10", userId: "demo-user-wanda" },
      { linear },
    );
    expect(result.errors).toBeUndefined();
    const { reassignIssue } = result.data as ReassignResult;
    expect(reassignIssue.__typename).toBe("ReassignSuccess");
    expect(reassignIssue.issue).toEqual({
      identifier: "AVG-10",
      quadrant: "DO",
      assignee: { name: "Wanda Maximoff" },
    });
    expect(loadOf(reassignIssue.team, "Wanda Maximoff")).toEqual({ now: 1, week1: 1 });
    expect(loadOf(reassignIssue.team, "Tony Stark")).toEqual({ now: 10, week1: 5 });

    // Linear keeps it: the next request reads it from there.
    const after = await run(`{ team { ${LOADS} } }`, {}, { linear });
    expect(loadOf((after.data as { team: Loads }).team, "Wanda Maximoff")).toEqual({
      now: 1,
      week1: 1,
    });
  });

  it("won't reassign an issue the viewer can't see", async () => {
    const result = await run(reassign, { issueId: "someone-elses", userId: "demo-user-wanda" });
    expect(result.errors).toBeUndefined();
    expect((result.data as ReassignResult).reassignIssue).toEqual({
      __typename: "IssueNotFound",
      message: "There's no such issue, or you can't see it.",
      issueId: "someone-elses",
    });
  });

  it("says the issue wasn't found when Linear doesn't make the change", async () => {
    const demo = new DemoLinear({ today });
    const unchanged: LinearSource = {
      request: (document, ...variables) =>
        document.toString() === ReassignIssueDocument.toString()
          ? demo.request(document, ...variables).then(
              (answer) =>
                ({
                  ...(answer as object),
                  issueUpdate: {
                    ...(answer as { issueUpdate: object }).issueUpdate,
                    success: false,
                  },
                }) as never,
            )
          : demo.request(document, ...variables),
    };
    const result = await run(
      reassign,
      { issueId: "demo-issue-avg-10", userId: "demo-user-wanda" },
      { linear: unchanged },
    );
    expect((result.data as ReassignResult).reassignIssue).toMatchObject({
      __typename: "IssueNotFound",
      issueId: "demo-issue-avg-10",
    });
  });

  it.each([
    { case: "signed out", options: { signedIn: false }, typename: "Unauthorized" },
    {
      case: "with a revoked Linear session",
      options: { linear: failingWith(new LinearAuthError("revoked")) },
      typename: "Unauthorized",
    },
    {
      case: "when Linear's rate limit is spent",
      options: { linear: failingWith(new LinearRateLimitError(null)) },
      typename: "LinearRateLimited",
    },
  ])("is $typename $case", async ({ options, typename }) => {
    const result = await run(
      reassign,
      { issueId: "demo-issue-avg-10", userId: "demo-user-wanda" },
      options,
    );
    expect(result.errors).toBeUndefined();
    expect((result.data as ReassignResult).reassignIssue.__typename).toBe(typename);
  });

  it("is Unauthorized when Linear won't let the viewer change the issue", async () => {
    const demo = new DemoLinear({ today });
    const readOnly: LinearSource = {
      request: (document, ...variables) =>
        document.toString() === ReassignIssueDocument.toString()
          ? Promise.reject(new LinearForbiddenError("Invalid scope: `write` required"))
          : demo.request(document, ...variables),
    };
    const result = await run(
      reassign,
      { issueId: "demo-issue-avg-10", userId: "demo-user-wanda" },
      { linear: readOnly },
    );
    expect(result.errors).toBeUndefined();
    expect((result.data as ReassignResult).reassignIssue).toEqual({
      __typename: "Unauthorized",
      message:
        "Linear won't let you change that. Sign in again to allow changes, or ask an admin of the team for access.",
    });
  });

  it("only hands an issue to someone on its team, and asks Linear for nothing else", async () => {
    const demo = new DemoLinear({ today });
    const sent: string[] = [];
    const watched: LinearSource = {
      request: (document, ...variables) => {
        sent.push(document.toString());
        return demo.request(document, ...variables);
      },
    };
    // Phil is on S.H.I.E.L.D. Ops, not the Avengers.
    const result = await run(
      reassign,
      { issueId: "demo-issue-avg-10", userId: "demo-user-phil" },
      { linear: watched },
    );
    expect(result.data).toBeNull();
    expect(result.errors?.map((e) => [e.message, e.extensions.code])).toEqual([
      ["There's nobody with that id on Avengers to hand AVG-10 to.", "BAD_USER_INPUT"],
    ]);
    expect(sent).not.toContain(ReassignIssueDocument.toString());
  });

  it("answers each of several moves in one request with the board after it", async () => {
    const { first, second } = await data<{
      first: ReassignResult["reassignIssue"];
      second: ReassignResult["reassignIssue"];
    }>(
      `mutation {
        first: reassignIssue(issueId: "demo-issue-avg-10", userId: "demo-user-wanda") {
          ... on ReassignSuccess { team { ${LOADS} } }
        }
        second: reassignIssue(issueId: "demo-issue-avg-9", userId: "demo-user-wanda") {
          ... on ReassignSuccess { team { ${LOADS} } }
        }
      }`,
    );
    expect(loadOf(first.team, "Wanda Maximoff")?.now).toBe(1);
    expect(loadOf(second.team, "Wanda Maximoff")?.now).toBe(2);
  });

  it("keeps an issue placed by hand where it was put", async () => {
    await data(
      `mutation { overrideQuadrant(issueId: "demo-issue-avg-10", quadrant: DROP) { __typename } }`,
    );
    const { reassignIssue } = await data<{
      reassignIssue: { issue: { quadrant: string; quadrantSource: string } };
    }>(
      `mutation {
        reassignIssue(issueId: "demo-issue-avg-10", userId: "demo-user-wanda") {
          ... on ReassignSuccess { issue { quadrant quadrantSource } }
        }
      }`,
    );
    expect(reassignIssue.issue).toEqual({ quadrant: "DROP", quadrantSource: "OVERRIDE" });
  });

  it("hands work only to members of the team, not to others holding its issues", async () => {
    const demo = new DemoLinear({ today });
    // Clint has left the Avengers, but still holds two of their issues.
    const withoutClint: LinearSource = {
      request: async (document, ...variables) => {
        const answer = await demo.request(document, ...variables);
        if (document.toString() !== TeamsMembersDocument.toString()) return answer;
        const { teams } = answer as {
          teams: { nodes: { members: { nodes: { id: string }[] } }[] };
        };
        for (const team of teams.nodes) {
          team.members.nodes = team.members.nodes.filter((m) => m.id !== "demo-user-clint");
        }
        return answer;
      },
    };
    const board = await run(
      `{ team {
        people { name }
        now: rebalanceSuggestions(horizon: NOW) { to { name } }
        ahead: rebalanceSuggestions(horizon: FORECAST) { to { name } }
      } }`,
      {},
      { linear: withoutClint },
    );
    const team = (
      board.data as {
        team: {
          people: { name: string }[];
          now: { to: { name: string } }[];
          ahead: { to: { name: string } }[];
        };
      }
    ).team;
    expect(team.people.map((p) => p.name)).toContain("Clint Barton");
    expect(team.now.length).toBeGreaterThan(0);
    expect([...team.now, ...team.ahead].map((s) => s.to.name)).not.toContain("Clint Barton");

    const result = await run(
      reassign,
      { issueId: "demo-issue-avg-10", userId: "demo-user-clint" },
      { linear: withoutClint },
    );
    expect(result.errors?.map((e) => e.extensions.code)).toEqual(["BAD_USER_INPUT"]);
  });

  it("still says the issue was handed over when the database fails afterwards", async () => {
    const failing = () => Promise.reject(new Error("D1_ERROR: database is locked"));
    const broken: PlacementStore = {
      ...writesTo(new Store(env.DB)),
      rules: failing,
      overrides: failing,
    };
    const result = await run(
      reassign,
      { issueId: "demo-issue-avg-10", userId: "demo-user-wanda" },
      { store: broken, log: () => {} },
    );
    expect(result.errors).toBeUndefined();
    expect((result.data as ReassignResult).reassignIssue).toMatchObject({
      __typename: "ReassignSuccess",
      issue: { identifier: "AVG-10", assignee: { name: "Wanda Maximoff" } },
    });
  });
});

/** Everyone's urgent load now and by the end of this week, counted in issues. */
const LOADS = `people {
  name
  weather(metric: ISSUES) { load }
  forecast(weeks: 1, metric: ISSUES) { weather { load } }
}`;
type Loads = {
  people: { name: string; weather: { load: number }; forecast: { weather: { load: number } }[] }[];
};
function loadOf(team: Loads | undefined, name: string) {
  const them = team?.people.find((p) => p.name === name);
  return them && { now: them.weather.load, week1: them.forecast[0]?.weather.load };
}

describe("an id Linear can't take", () => {
  // Linear rejects an id that isn't one (not a UUID or an identifier like ENG-123) as invalid
  // input, rather than finding no issue. The demo just finds none.
  const demo = new DemoLinear({ today });
  const strict: LinearSource = {
    request: (document, ...variables) =>
      document.toString() === IssueByIdDocument.toString()
        ? Promise.reject(new LinearInvalidInputError("Argument Validation Error"))
        : demo.request(document, ...variables),
  };

  it.each([
    [
      "reassignIssue",
      `mutation { reassignIssue(issueId: "not-an-issue", userId: "demo-user-wanda") { __typename ... on IssueNotFound { issueId } } }`,
    ],
    [
      "overrideQuadrant",
      `mutation { overrideQuadrant(issueId: "not-an-issue", quadrant: DO) { __typename ... on IssueNotFound { issueId } } }`,
    ],
  ])("is IssueNotFound for %s", async (field, source) => {
    const result = await run(source, {}, { linear: strict });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      [field]: { __typename: "IssueNotFound", issueId: "not-an-issue" },
    });
  });
});

/** A Linear that fails every request this way. */
function failingWith(error: Error): LinearSource {
  return { request: () => Promise.reject(error) };
}

describe("the web app's board query", () => {
  it("is valid against the schema and loads the demo board", async () => {
    const board = await data(BOARD_QUERY, { teamId: null });
    expect(board.viewer).toMatchObject({ name: "Nick Fury" });
    expect(board.team).toMatchObject({ name: "Avengers" });
  });
  it("limits the urgency window as the server does", () => {
    expect(WEB_MAX_URGENCY_WINDOW_DAYS).toBe(MAX_URGENCY_WINDOW_DAYS);
    expect(WEB_MAX_TIME_OFF).toBe(MAX_TIME_OFF);
  });

  /** A mutation's answer, whichever union member it is; codegen checks each fits. */
  type Answer = Record<string, { __typename: string; team?: TeamBoardData }>;

  /** Where an issue sits on a TeamBoard answer, and who put it there. */
  function placement(team: TeamBoardData | undefined, issueId: string) {
    const matrices = team ? [...team.people.flatMap((p) => p.matrix ?? []), team.unassigned] : [];
    for (const matrix of matrices) {
      for (const quadrant of QUADRANTS) {
        const issue = matrix[quadrant].find((i) => i.id === issueId);
        if (issue) return { quadrant, source: issue.quadrantSource };
      }
    }
    return null;
  }

  it("changes the rules and answers with the team's board", async () => {
    const rules: QuadrantRulesInput = {
      importantFrom: 1,
      urgencyWindowDays: 7,
      noDueDate: "URGENT",
      dropAlertPercent: 25,
      awayStatuses: ["🌴"],
    };
    const { updateQuadrantRules }: Answer = await data(UPDATE_RULES_MUTATION, {
      teamId: DEMO_TEAM.id,
      input: rules,
    });
    expect(updateQuadrantRules?.__typename).toBe("UpdateRulesSuccess");
    expect(updateQuadrantRules?.team?.rules).toEqual(rules);
    expect(updateQuadrantRules?.team?.people.length).toBeGreaterThan(0);
  });

  it("places an issue by hand and hands it back, answering with the team's board", async () => {
    const { overrideQuadrant }: Answer = await data(OVERRIDE_MUTATION, {
      issueId: "demo-issue-avg-1",
      quadrant: "DROP",
    });
    expect(overrideQuadrant?.__typename).toBe("OverrideSuccess");
    expect(placement(overrideQuadrant?.team, "demo-issue-avg-1")).toEqual({
      quadrant: "drop",
      source: "OVERRIDE",
    });
    const { clearOverride }: Answer = await data(CLEAR_OVERRIDE_MUTATION, {
      issueId: "demo-issue-avg-1",
    });
    expect(clearOverride?.__typename).toBe("OverrideSuccess");
    expect(placement(clearOverride?.team, "demo-issue-avg-1")).toMatchObject({ source: "RULE" });
  });

  it("hands an issue to someone else, answering with the team's board planned again", async () => {
    const { reassignIssue }: Answer = await data(REASSIGN_MUTATION, {
      issueId: "demo-issue-avg-10",
      userId: "demo-user-wanda",
    });
    expect(reassignIssue?.__typename).toBe("ReassignSuccess");
    const wanda = reassignIssue?.team?.people.find((p) => p.name === "Wanda Maximoff");
    expect(wanda?.matrix?.do.map((issue) => issue.id)).toEqual(["demo-issue-avg-10"]);
    expect(reassignIssue?.team?.rebalanceNow).toBeInstanceOf(Array);
  });

  it("sets someone's capacity, answering with the team's board weighed by it", async () => {
    const { setCapacity }: Answer = await data(SET_CAPACITY_MUTATION, {
      teamId: DEMO_TEAM.id,
      userId: "demo-user-tony",
      factor: 0.5,
    });
    expect(setCapacity?.__typename).toBe("SetCapacitySuccess");
    const tony = setCapacity?.team?.people.find((p) => p.name === "Tony Stark");
    expect(tony?.capacity).toBe(0.5);
    expect(tony?.weather?.reason).toContain("at half time");
  });

  it("adds and takes back time off, answering with the team's board weighed by it", async () => {
    const { addTimeOff }: Answer = await data(ADD_TIME_OFF_MUTATION, {
      teamId: DEMO_TEAM.id,
      userId: "demo-user-tony",
      startsOn: "2026-10-18",
      endsOn: "2026-10-23",
    });
    expect(addTimeOff?.__typename).toBe("TimeOffSuccess");
    const tony = addTimeOff?.team?.people.find((p) => p.name === "Tony Stark");
    expect(tony?.weather?.kind).toBe("AWAY");
    const [timeOff] = tony?.timeOff ?? [];
    expect(timeOff).toMatchObject({ startsOn: "2026-10-18", endsOn: "2026-10-23" });

    const { removeTimeOff }: Answer = await data(REMOVE_TIME_OFF_MUTATION, {
      teamId: DEMO_TEAM.id,
      userId: "demo-user-tony",
      timeOffId: timeOff?.id ?? "",
    });
    expect(removeTimeOff?.__typename).toBe("TimeOffSuccess");
    const back = removeTimeOff?.team?.people.find((p) => p.name === "Tony Stark");
    expect(back?.timeOff).toEqual([]);
    expect(back?.weather?.kind).not.toBe("AWAY");
  });

  it("reads a team's board again, as it stands", async () => {
    const { team } = await data(TEAM_QUERY, { teamId: DEMO_OPS_TEAM.id });
    expect(team?.name).toBe("S.H.I.E.L.D. Ops");
    expect(team?.people.length).toBeGreaterThan(0);
  });
});

describe("Linear requests per query", () => {
  /** The operations a query sends to Linear, by name. */
  async function linearRequests<TVariables>(
    operation: Operation<unknown, TVariables>,
    variables?: TVariables,
  ) {
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
      source: operation.toString(),
      variableValues: variables as Record<string, unknown> | undefined,
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
