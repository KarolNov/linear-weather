import { describe, expect, it } from "vitest";
import { loadBoard } from "./board";
import { DEFAULT_RULES } from "./domain/quadrant";
import type { LinearSource } from "./linear/client";
import { DEMO_OPS_TEAM, DEMO_TEAM, DemoLinear } from "./linear/demo";
import {
  TeamMembersDocument,
  TeamOpenIssuesDocument,
  TeamsDocument,
  type TypedDocumentString,
} from "./linear/generated";
import type { IssueCard } from "./linear/team-issues";

const today = "2026-10-18";
const options = { today, rules: DEFAULT_RULES };

/** A tiny workspace: answers each query with the given result. */
function workspace(...answers: [TypedDocumentString<unknown, never>, unknown][]): LinearSource {
  const byQuery = new Map(answers.map(([document, result]) => [document.toString(), result]));
  return {
    request: async (document: { toString(): string }, ..._variables: unknown[]) => {
      const query = document.toString();
      if (!byQuery.has(query)) throw new Error(`unexpected query ${query}`);
      return byQuery.get(query) as never;
    },
  };
}

const ada = { id: "u-ada", name: "Ada", avatarUrl: null };
const grace = { id: "u-grace", name: "Grace", avatarUrl: null };
const linus = { id: "u-linus", name: "Linus", avatarUrl: null };

function issue(n: number, fields: Partial<IssueCard>): IssueCard {
  return {
    id: `i-${n}`,
    identifier: `ENG-${n}`,
    title: `Issue ${n}`,
    url: `https://linear.app/acme/issue/ENG-${n}`,
    dueDate: null,
    priority: 3,
    estimate: null,
    assignee: null,
    state: { name: "Todo", type: "unstarted" },
    ...fields,
  };
}

describe("loadBoard", () => {
  it("lists teams by name and shows the first when none is asked for", async () => {
    const board = await loadBoard(new DemoLinear({ today }), options);
    expect(board.teams.map((t) => t.name)).toEqual(["Avengers", "S.H.I.E.L.D. Ops"]);
    expect(board.team?.id).toBe(DEMO_TEAM.id);
    expect(board.today).toBe(today);
  });

  it("shows the team asked for, and falls back to the first for an unknown one", async () => {
    const demo = new DemoLinear({ today });
    expect((await loadBoard(demo, { ...options, teamId: DEMO_OPS_TEAM.id })).team?.id).toBe(
      DEMO_OPS_TEAM.id,
    );
    expect((await loadBoard(demo, { ...options, teamId: "nope" })).team?.id).toBe(DEMO_TEAM.id);
  });

  it("gives every member a matrix, even with nothing assigned, and unassigned work last", async () => {
    const { people } = await loadBoard(new DemoLinear({ today }), options);
    expect(people.map((p) => p.assignee?.name ?? null)).toEqual([
      "Bruce Banner",
      "Clint Barton",
      "Natasha Romanoff",
      "Steve Rogers",
      "Thor Odinson",
      "Tony Stark",
      "Wanda Maximoff",
      null,
    ]);
    const wanda = people.find((p) => p.assignee?.name === "Wanda Maximoff");
    expect(wanda).toEqual({
      assignee: expect.anything(),
      counts: { do: 0, schedule: 0, delegate: 0, drop: 0 },
      issues: [],
    });
  });

  it("classifies each issue and counts the quadrants", async () => {
    const { people } = await loadBoard(new DemoLinear({ today }), options);
    const tony = people.find((p) => p.assignee?.name === "Tony Stark");
    expect(tony?.counts).toEqual({ do: 9, schedule: 1, delegate: 2, drop: 1 });
    expect(tony?.issues[0]).toMatchObject({
      title: "Patch the arc reactor's memory leak",
      quadrant: "do",
      reason: "Urgent priority, overdue by 5 days",
    });
    for (const person of people) {
      const total = Object.values(person.counts).reduce((a, b) => a + b, 0);
      expect(total).toBe(person.issues.length);
    }
  });

  it("sorts each person's issues by due date, undated last, then by priority", async () => {
    const issues = [
      issue(1, { assignee: ada, dueDate: null, priority: 1 }),
      issue(2, { assignee: ada, dueDate: "2026-10-20", priority: 0 }),
      issue(3, { assignee: ada, dueDate: "2026-10-20", priority: 4 }),
      issue(4, { assignee: ada, dueDate: "2026-10-19", priority: 4 }),
    ];
    const board = await loadBoard(
      workspace(
        [TeamsDocument, { teams: { nodes: [{ id: "t", name: "Eng", key: "ENG" }] } }],
        [TeamMembersDocument, { team: { members: { nodes: [ada] } } }],
        [
          TeamOpenIssuesDocument,
          { issues: { nodes: issues, pageInfo: { hasNextPage: false, endCursor: null } } },
        ],
      ),
      options,
    );
    expect(board.people[0]?.issues.map((i) => i.identifier)).toEqual([
      "ENG-4",
      "ENG-3",
      "ENG-2",
      "ENG-1",
    ]);
  });

  it("adds people who hold the team's issues without being on it, after the members", async () => {
    const board = await loadBoard(
      workspace(
        [TeamsDocument, { teams: { nodes: [{ id: "t", name: "Eng", key: "ENG" }] } }],
        [TeamMembersDocument, { team: { members: { nodes: [linus, grace] } } }],
        [
          TeamOpenIssuesDocument,
          {
            issues: {
              nodes: [issue(1, { assignee: ada }), issue(2, { assignee: grace })],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        ],
      ),
      options,
    );
    expect(board.people.map((p) => p.assignee?.name)).toEqual(["Grace", "Linus", "Ada"]);
  });

  it("is empty when the workspace has no teams", async () => {
    const board = await loadBoard(workspace([TeamsDocument, { teams: { nodes: [] } }]), options);
    expect(board).toEqual({ today, teams: [], team: null, people: [] });
  });
});
