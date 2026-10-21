import { describe, expect, it, vi } from "vitest";
import type { LinearSource } from "./linear/client";
import { DEMO_OPS_TEAM, DEMO_TEAM, DemoLinear } from "./linear/demo";
import {
  OpenIssuesDocument,
  TeamsDocument,
  TeamsMembersDocument,
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

/** One page of the `OpenIssues` answer, every issue on team `t`. */
const page = (nodes: IssueCard[], teamId = "t") => ({
  issues: {
    nodes: nodes.map((n) => ({ ...n, team: { id: teamId } })),
    pageInfo: { hasNextPage: false, endCursor: null },
  },
});

/** The `TeamsMembers` answer. */
const members = (...teams: [id: string, people: (typeof ada)[]][]) => ({
  teams: { nodes: teams.map(([id, people]) => ({ id, members: { nodes: people } })) },
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
        const { teamIds } = variables[0] as { teamIds: string[] };
        order.push(...teamIds);
        if (teamIds.join() === "gone") return members() as never;
        throw new Error("only the asked-for team should be fetched");
      },
    };
    const picking = new Workspace(source).team("gone");
    // The asked-for team's queries go out before the team list answers.
    await vi.waitFor(() => expect(order.toSorted()).toEqual(["gone", "gone", "teams"]));
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
      [TeamsMembersDocument, members(["t", [linus, grace]])],
      [OpenIssuesDocument, page([issue(1, { assignee: ada }), issue(2, { assignee: grace })])],
    );
    const { people, issues } = await new Workspace(source).teamWork("t");
    expect(people.map((p) => p.name)).toEqual(["Grace", "Linus", "Ada"]);
    expect(issues.map((i) => i.id)).toEqual(["i-1", "i-2"]);
  });

  it("fetches each team once however often it's asked for", async () => {
    const { source, asked } = linear(
      [TeamsDocument, teams([{ id: "t", name: "Eng", key: "ENG" }])],
      [TeamsMembersDocument, members(["t", [ada]])],
      [OpenIssuesDocument, page([issue(1, { assignee: ada })])],
    );
    const workspace = new Workspace(source);
    await Promise.all([
      workspace.team("t"),
      workspace.teamWork("t"),
      workspace.teamWork("t"),
      workspace.teams(),
    ]);
    expect(asked.toSorted()).toEqual(
      [TeamsDocument, TeamsMembersDocument, OpenIssuesDocument].map(String).toSorted(),
    );
  });

  it("asks Linear about every team asked for in the same tick in one query each", async () => {
    const sent: { query: string; variables: unknown }[] = [];
    const source: LinearSource = {
      request: async (document: { toString(): string }, ...variables: unknown[]) => {
        const query = document.toString();
        sent.push({ query, variables: variables[0] });
        if (query === TeamsMembersDocument.toString()) {
          return members(["t1", [ada]], ["t2", [grace, linus]]) as never;
        }
        const { nodes } = page([issue(1, { assignee: grace })], "t2").issues;
        return {
          issues: {
            nodes: [...nodes, ...page([issue(2, {})], "t1").issues.nodes],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        } as never;
      },
    };
    const workspace = new Workspace(source);
    const [t1, t2, gone] = await Promise.allSettled(
      ["t1", "t2", "gone"].map((id) => workspace.teamWork(id)),
    );
    expect(sent.map(({ variables }) => variables)).toEqual([
      { teamIds: ["t1", "t2", "gone"], first: 3 },
      { teamIds: ["t1", "t2", "gone"], first: 250, after: null },
    ]);
    expect(t1).toMatchObject({ value: { people: [ada], issues: [{ id: "i-2" }] } });
    expect(t2).toMatchObject({ value: { people: [grace, linus], issues: [{ id: "i-1" }] } });
    // Linear leaves out teams the viewer can't see.
    expect(gone).toMatchObject({ reason: new Error("Entity not found: Team gone") });
  });
});
