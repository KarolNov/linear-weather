import { env } from "cloudflare:workers";
import { graphql } from "graphql";
import { describe, expect, it } from "vitest";
// The web app keeps its query by its components; checking it here catches schema drift.
import { BOARD_QUERY } from "../../web/src/board";
import { Store } from "./db/store";
import { DEMO_OPS_TEAM, DEMO_TEAM, DemoLinear } from "./linear/demo";
import { type PlacementSource, Placements } from "./placements";
import { type GraphQLContext, schema } from "./schema";
import { Workspace } from "./workspace";

const today = "2026-10-18";

/** Runs a query against the demo workspace, or signed out, with rules and overrides from D1. */
function run(
  source: string,
  variables: Record<string, unknown> = {},
  { signedIn = true, store = new Store(env.DB) as PlacementSource } = {},
) {
  const contextValue: GraphQLContext = {
    workspace: async () => (signedIn ? new Workspace(new DemoLinear({ today })) : null),
    placements: new Placements(store),
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

  it("reads each team's rules and overrides once per request, however many people", async () => {
    const store = new Store(env.DB);
    const reads = { rules: 0, overrides: 0 };
    const counting: PlacementSource = {
      rules: (teamId) => {
        reads.rules++;
        return store.rules(teamId);
      },
      overrides: (ids) => {
        reads.overrides++;
        return store.overrides(ids);
      },
    };
    const result = await run(tony, {}, { store: counting });
    expect(result.errors).toBeUndefined();
    expect(reads).toEqual({ rules: 1, overrides: 1 });
  });
});

describe("the web app's board query", () => {
  it("is valid against the schema and loads the demo board", async () => {
    const board = await data<{ viewer: unknown; team: unknown }>(BOARD_QUERY, { teamId: null });
    expect(board.viewer).toMatchObject({ name: "Nick Fury" });
    expect(board.team).toMatchObject({ name: "Avengers" });
  });
});
