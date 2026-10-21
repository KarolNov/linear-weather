import { describe, expect, it } from "vitest";
import type { LinearSource } from "./linear/client";
import { DEMO_OPS_TEAM, DEMO_TEAM, DemoLinear } from "./linear/demo";
import {
  TeamMembersDocument,
  TeamOpenIssuesDocument,
  TeamsDocument,
  type TypedDocumentString,
} from "./linear/generated";
import type { IssueCard } from "./linear/team-issues";
import { Workspace } from "./workspace";

const today = "2026-10-18";

/** A tiny workspace: answers each query with the given result, and counts what it was asked. */
function linear(...answers: [TypedDocumentString<unknown, never>, unknown][]) {
  const byQuery = new Map(answers.map(([document, result]) => [document.toString(), result]));
  const asked: string[] = [];
  const source: LinearSource = {
    request: async (document: { toString(): string }, ..._variables: unknown[]) => {
      const query = document.toString();
      if (!byQuery.has(query)) throw new Error(`unexpected query ${query}`);
      asked.push(query);
      return byQuery.get(query) as never;
    },
  };
  return { source, asked };
}

/** The `Teams` answer: every team the viewer can see, and the ones they're on. */
function teams(all: { id: string; name: string; key: string }[], theirs: string[] = []) {
  return { teams: { nodes: all }, viewer: { teams: { nodes: theirs.map((id) => ({ id })) } } };
}

const page = (nodes: IssueCard[]) => ({
  issues: { nodes, pageInfo: { hasNextPage: false, endCursor: null } },
});

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

describe("Workspace.team", () => {
  it("lists teams by name and defaults to the first when none is asked for", async () => {
    const workspace = new Workspace(new DemoLinear({ today }));
    expect((await workspace.teams()).map((t) => t.name)).toEqual(["Avengers", "S.H.I.E.L.D. Ops"]);
    expect((await workspace.team())?.id).toBe(DEMO_TEAM.id);
  });

  it("finds the team asked for, and falls back to the default for an unknown one", async () => {
    const workspace = new Workspace(new DemoLinear({ today }));
    expect((await workspace.team(DEMO_OPS_TEAM.id))?.id).toBe(DEMO_OPS_TEAM.id);
    expect((await workspace.team("nope"))?.id).toBe(DEMO_TEAM.id);
  });

  it("defaults to a team the viewer is on rather than the first by name", async () => {
    const eng = { id: "t-eng", name: "Engineering", key: "ENG" };
    const accounts = { id: "t-acc", name: "Accounts", key: "ACC" };
    const { source } = linear([TeamsDocument, teams([eng, accounts], [eng.id])]);
    expect(await new Workspace(source).team()).toEqual(eng);
  });

  it("asks for the requested team's work alongside the team list", async () => {
    const order: string[] = [];
    let releaseTeams = () => {};
    const teamsAnswered = new Promise<void>((resolve) => {
      releaseTeams = resolve;
    });
    const source: LinearSource = {
      request: async (document: { toString(): string }, ...variables: unknown[]) => {
        const query = document.toString();
        if (query === TeamsDocument.toString()) {
          order.push("teams");
          await teamsAnswered;
          return teams([{ id: "t", name: "Eng", key: "ENG" }]) as never;
        }
        const { teamId } = variables[0] as { teamId: string };
        order.push(teamId);
        if (teamId === "gone") throw new Error("Entity not found: Team gone");
        throw new Error("only the asked-for team should be fetched");
      },
    };
    const picking = new Workspace(source).team("gone");
    await Promise.resolve();
    // The asked-for team's queries went out before the team list answered.
    expect(order).toEqual(["gone", "gone", "teams"]);
    releaseTeams();
    expect((await picking)?.id).toBe("t");
  });

  it("is null when the workspace has no teams", async () => {
    const { source } = linear([TeamsDocument, teams([])]);
    expect(await new Workspace(source).team()).toBeNull();
  });
});

describe("Workspace.teamWork", () => {
  it("lists members by name, then people holding the team's issues without being on it", async () => {
    const { source } = linear(
      [TeamMembersDocument, { team: { members: { nodes: [linus, grace] } } }],
      [TeamOpenIssuesDocument, page([issue(1, { assignee: ada }), issue(2, { assignee: grace })])],
    );
    const { people, issues } = await new Workspace(source).teamWork("t");
    expect(people.map((p) => p.name)).toEqual(["Grace", "Linus", "Ada"]);
    expect(issues.map((i) => i.id)).toEqual(["i-1", "i-2"]);
  });

  it("fetches each team once however often it's asked for", async () => {
    const { source, asked } = linear(
      [TeamsDocument, teams([{ id: "t", name: "Eng", key: "ENG" }])],
      [TeamMembersDocument, { team: { members: { nodes: [ada] } } }],
      [TeamOpenIssuesDocument, page([issue(1, { assignee: ada })])],
    );
    const workspace = new Workspace(source);
    await Promise.all([
      workspace.team("t"),
      workspace.teamWork("t"),
      workspace.teamWork("t"),
      workspace.teams(),
    ]);
    expect(asked.toSorted()).toEqual(
      [TeamsDocument, TeamMembersDocument, TeamOpenIssuesDocument].map(String).toSorted(),
    );
  });
});
