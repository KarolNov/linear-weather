// A mocked Linear workspace: the original Avengers, with Nick Fury as their PM. It answers the
// same typed queries as Linear's API, so the board can be built and demoed without a Linear
// workspace. Deterministic: due dates are offsets from "today", nothing is random.

import { addDays, type CalendarDate, type LinearPriority } from "../domain/quadrant";
import type { LinearSource } from "./client";
import {
  IssueByIdDocument,
  type IssueByIdQuery,
  type IssueByIdQueryVariables,
  OpenIssuesDocument,
  type OpenIssuesQuery,
  type OpenIssuesQueryVariables,
  ReassignIssueDocument,
  type ReassignIssueMutation,
  type ReassignIssueMutationVariables,
  TeamsDocument,
  TeamsMembersDocument,
  type TeamsMembersQuery,
  type TeamsMembersQueryVariables,
  type TeamsQuery,
  type TypedDocumentString,
  ViewerDocument,
  type ViewerQuery,
} from "./generated";
import type { Assignee, IssueCard, OpenIssue } from "./team-issues";

const member = (key: string, name: string): Assignee => ({
  id: `demo-user-${key}`,
  name,
  avatarUrl: null,
});

const tony = member("tony", "Tony Stark");
const steve = member("steve", "Steve Rogers");
const natasha = member("natasha", "Natasha Romanoff");
const bruce = member("bruce", "Bruce Banner");
const thor = member("thor", "Thor Odinson");
const clint = member("clint", "Clint Barton");
const wanda = member("wanda", "Wanda Maximoff");
const phil = member("phil", "Phil Coulson");
const maria = member("maria", "Maria Hill");
const melinda = member("melinda", "Melinda May");

export const DEMO_VIEWER: ViewerQuery["viewer"] = {
  id: "demo-user-fury",
  name: "Nick Fury",
  avatarUrl: null,
  organization: { name: "S.H.I.E.L.D.", urlKey: "shield" },
};

export const DEMO_TEAM = {
  id: "demo-team-avengers",
  name: "Avengers",
  key: "AVG",
  /**
   * Everyone on the team. Wanda has nothing assigned, so she never shows up in the issues:
   * she's here for the board's empty plate.
   */
  members: [tony, steve, natasha, bruce, thor, clint, wanda],
};

/** A second, smaller team, so the board's team picker has somewhere to go. */
export const DEMO_OPS_TEAM = {
  id: "demo-team-ops",
  name: "S.H.I.E.L.D. Ops",
  key: "OPS",
  members: [phil, maria, melinda, natasha],
};

type StateName = "Triage" | "Backlog" | "Todo" | "In Progress" | "In Review";

const STATE_TYPE: Record<StateName, string> = {
  Triage: "triage",
  Backlog: "backlog",
  Todo: "unstarted",
  "In Progress": "started",
  "In Review": "started",
};

/**
 * One open issue: who has it, what it is, priority, due in how many days from today (negative
 * is overdue, null is no due date), estimate (null is unestimated), and workflow state.
 */
type DemoIssue = [
  assignee: Assignee | null,
  title: string,
  priority: LinearPriority,
  dueInDays: number | null,
  estimate: number | null,
  state: StateName,
];

// The Avengers. Matches the sign-in page's preview. With the default rules (urgent = due within 14 days or
// overdue; important = Medium priority or higher):
// - Tony is overloaded: 11 urgent, 3 of them overdue, and one due today.
// - Steve has 2 urgent, Natasha 4, Bruce 6 with more turning urgent next week, Clint 1.
// - Thor's work has no due dates: fog.
// - Every quadrant and every priority appears, some issues are unestimated, and a few are
//   unassigned.
const AVENGERS_ISSUES: DemoIssue[] = [
  [tony, "Patch the arc reactor's memory leak", 1, -5, 5, "In Progress"],
  [tony, "Recall the Mark XLII suits that fly off on their own", 1, -2, 8, "In Progress"],
  [tony, "Answer the board about the Stark Expo budget", 3, -1, null, "Todo"],
  [tony, "Ship JARVIS voice commands to the Quinjet", 2, 0, 3, "In Progress"],
  [tony, "Rewire the Helicarrier's turbines", 1, 1, 8, "In Progress"],
  [tony, "Upgrade War Machine's targeting", 2, 2, 5, "Todo"],
  [tony, "Review Ultron's code before anyone runs it", 1, 3, 13, "In Review"],
  [tony, "Fix the Tower elevator that talks back", 4, 4, 1, "Todo"],
  [tony, "Sign off on Spider-Man's suit permissions", 3, 6, 2, "Todo"],
  [tony, "Replace the repulsor gloves' firmware", 2, 9, null, "Todo"],
  [tony, "Stock the lab with more blueberries", 0, 12, null, "Todo"],
  [tony, "Design a suit for deep space", 2, 20, 13, "Backlog"],
  [tony, "Tidy the workshop", 4, null, 1, "Backlog"],

  [steve, "Brief the team on the Sokovia Accords", 2, 5, 2, "In Progress"],
  [steve, "Find Bucky's last known location", 1, 10, 5, "In Progress"],
  [steve, "Update the shield-throwing training plan", 3, 25, 3, "Todo"],
  [steve, "Catch up on the last 70 years", 4, null, null, "Backlog"],
  [steve, "Restore the 1940s motorcycle", 4, 40, 2, "Backlog"],

  [natasha, "Debrief on Budapest", 2, -3, 3, "In Progress"],
  [natasha, "Infiltrate the HYDRA cell in Lagos", 1, 4, 8, "In Progress"],
  [natasha, "Rotate the safehouse codes", 3, 8, 1, "Todo"],
  [natasha, "Audit the Red Room files", 2, 11, 5, "In Review"],
  [natasha, "Plan the Moscow extraction", 2, 16, 5, "Todo"],
  [natasha, "Teach Clint's kids to play chess", 0, 30, null, "Todo"],

  [bruce, "Calibrate the gamma radiation sensors", 2, 1, 3, "In Progress"],
  [bruce, "Write up the Hulk containment protocol", 1, 2, 8, "In Progress"],
  [bruce, "Repair the lab door (again)", 4, 3, 2, "Todo"],
  [bruce, "Peer-review Tony's Ultron paper", 2, 6, 3, "In Review"],
  [bruce, "Order more stretchy purple trousers", 4, 7, null, "Todo"],
  [bruce, "Brew a calming tea for the lab", 3, 13, 1, "Todo"],
  [bruce, "Model the Tesseract's energy signature", 1, 14, 13, "Backlog"],
  [bruce, "Prepare the Culver University lecture", 2, 17, 5, "Todo"],
  [bruce, "Publish the cell regeneration study", 3, 19, 8, "Todo"],

  [thor, "Return Mjölnir to its rightful spot", 2, null, 1, "Todo"],
  [thor, "Find the Infinity Stones", 1, null, null, "Backlog"],
  [thor, "Learn how the coffee machine works", 4, null, 1, "Triage"],
  [thor, "Visit Jane in New Mexico", 3, null, 2, "Backlog"],
  [thor, "Settle things with Loki", 1, null, 13, "Backlog"],
  [thor, "Repair the Bifrost", 2, null, null, "In Progress"],
  [thor, "Explain Asgardian table manners", 0, null, null, "Backlog"],
  [thor, "Run hammer drills with the team", 3, 22, 3, "Todo"],

  [clint, "Restock the trick arrows", 3, 6, 2, "In Progress"],
  [clint, "Fix the farmhouse roof", 4, null, 3, "Backlog"],

  [null, "Triage the Chitauri wreckage reports", 1, -4, null, "Triage"],
  [null, "Decide who pays for the New York cleanup", 2, null, null, "Backlog"],
  [null, "Repaint the Tower logo", 4, 9, 2, "Todo"],
  [null, "Rename the Quinjet", 0, null, 1, "Backlog"],
];

// S.H.I.E.L.D. Ops: Natasha is on both teams, but her Ops work is separate.
const OPS_ISSUES: DemoIssue[] = [
  [phil, "Restore Lola's flight systems", 2, 3, 5, "In Progress"],
  [phil, "Recruit for the new field team", 3, 15, 3, "Todo"],
  [phil, "Sign the Avengers' trading cards", 4, null, 1, "Backlog"],
  [maria, "Audit Helicarrier crew rosters", 1, -1, 3, "In Progress"],
  [maria, "Schedule the quarterly fire drill", 3, 9, 1, "Todo"],
  [melinda, "Run the cavalry refresher course", 2, 20, 5, "Todo"],
  [natasha, "Hand over the Lagos safehouse", 3, 5, 2, "Todo"],
  [null, "Find a new HQ after the Triskelion", 1, 30, 13, "Backlog"],
];

const TEAMS = [
  { team: DEMO_TEAM, issues: AVENGERS_ISSUES },
  { team: DEMO_OPS_TEAM, issues: OPS_ISSUES },
];

/** A team's open issues (the Avengers' by default), with due dates counted from `today`. */
export function demoIssues(today: CalendarDate, teamId: string = DEMO_TEAM.id): IssueCard[] {
  const demo = TEAMS.find(({ team }) => team.id === teamId);
  if (!demo) return [];
  const { key } = demo.team;
  return demo.issues.map(([assignee, title, priority, dueInDays, estimate, state], i) => ({
    id: `demo-issue-${key.toLowerCase()}-${i + 1}`,
    identifier: `${key}-${i + 1}`,
    title,
    // Shaped like Linear's links, though nothing is there: the workspace is made up.
    url: `https://linear.app/${DEMO_VIEWER.organization.urlKey}/issue/${key}-${i + 1}`,
    dueDate: dueInDays === null ? null : addDays(today, dueInDays),
    priority,
    estimate,
    assignee,
    state: { name: state, type: STATE_TYPE[state] },
  }));
}

/**
 * Who a visitor handed the demo's issues to, by issue id. The demo workspace is shared, so this
 * is kept per visitor (in their cookie, by DemoStore) rather than in DemoLinear.
 */
export interface DemoAssignments {
  assignee(issueId: string): string | undefined;
  /** With null, the issue goes back to whoever the demo gives it to. */
  setAssignee(issueId: string, userId: string | null): void;
}

/** Assignments kept for as long as the DemoLinear lives: one request's, or one test's. */
function inMemory(): DemoAssignments {
  const assignees = new Map<string, string>();
  return {
    assignee: (issueId) => assignees.get(issueId),
    setAssignee: (issueId, userId) => {
      if (userId === null) assignees.delete(issueId);
      else assignees.set(issueId, userId);
    },
  };
}

/** Every demo issue by id, with its team. Ids and assignees don't depend on the day. */
const BY_ID = new Map(
  TEAMS.flatMap(({ team }) =>
    demoIssues("2000-01-01", team.id).map((issue) => [issue.id, { team, issue }] as const),
  ),
);

/** A demo issue, its team, and who the demo gives it to; undefined for an id it doesn't know. */
export function demoIssue(id: string) {
  return BY_ID.get(id);
}

export interface DemoLinearOptions {
  /** The demo's "today". Defaults to the current UTC date, read on every request. */
  today?: CalendarDate;
  /** Who issues were handed to. Defaults to none, and reassigning keeps them in memory. */
  assignments?: DemoAssignments;
}

/** A `LinearSource` that answers from the mocked Avengers workspace instead of Linear. */
export class DemoLinear implements LinearSource {
  /** The issues for the last teams and "today" asked about, so paging doesn't rebuild them. */
  private issues: { teams: string; today: CalendarDate; all: OpenIssue[] } | undefined;
  private readonly assignments: DemoAssignments;

  constructor(private readonly options: DemoLinearOptions = {}) {
    this.assignments = options.assignments ?? inMemory();
  }

  async request<TResult, TVariables>(
    document: TypedDocumentString<TResult, TVariables>,
    ...[variables]: TVariables extends Record<string, never> ? [] : [TVariables]
  ): Promise<TResult> {
    const query = document.toString();
    if (query === ViewerDocument.toString()) {
      return { viewer: DEMO_VIEWER } satisfies ViewerQuery as TResult;
    }
    if (query === TeamsDocument.toString()) {
      const nodes = TEAMS.map(({ team: { id, name, key } }) => ({ id, name, key }));
      // Fury oversees every team without being on one, so the board opens on the first.
      const viewer = { teams: { nodes: [] } };
      return { teams: { nodes }, viewer } satisfies TeamsQuery as TResult;
    }
    if (query === TeamsMembersDocument.toString()) {
      return this.teamsMembers(variables as TeamsMembersQueryVariables) as TResult;
    }
    if (query === OpenIssuesDocument.toString()) {
      return this.openIssues(variables as OpenIssuesQueryVariables) as TResult;
    }
    if (query === IssueByIdDocument.toString()) {
      return this.issueById(variables as IssueByIdQueryVariables) as TResult;
    }
    if (query === ReassignIssueDocument.toString()) {
      return this.reassign(variables as ReassignIssueMutationVariables) as TResult;
    }
    throw new Error(`The demo workspace can't answer this query yet:\n${query}`);
  }

  /** Like Linear's `teams`, teams it doesn't know are left out. */
  private teamsMembers({ teamIds, first }: TeamsMembersQueryVariables) {
    const ids = [teamIds].flat();
    const nodes = TEAMS.filter(({ team }) => ids.includes(team.id))
      .slice(0, first)
      .map(({ team }) => ({ id: team.id, members: { nodes: team.members } }));
    return { teams: { nodes } } satisfies TeamsMembersQuery;
  }

  /** Like Linear's `issues` filtered by id: no nodes for an issue it doesn't know. */
  private issueById({ id }: IssueByIdQueryVariables) {
    const today = this.today();
    const nodes = TEAMS.flatMap(({ team: { id: teamId, name, key } }) =>
      this.teamIssues(today, teamId)
        .filter((issue) => issue.id === id)
        .map((issue) => ({ ...issue, team: { id: teamId, name, key } })),
    );
    return { issues: { nodes } } satisfies IssueByIdQuery;
  }

  /** Pages like Linear's `issues` connection; cursors are the index of the next issue. */
  private openIssues({ teamIds, first, after }: OpenIssuesQueryVariables) {
    const today = this.today();
    const teams = [teamIds].flat().join(",");
    if (this.issues?.today !== today || this.issues.teams !== teams) {
      const all = [teamIds]
        .flat()
        .flatMap((id) => this.teamIssues(today, id).map((issue) => ({ ...issue, team: { id } })));
      this.issues = { teams, today, all };
    }
    const { all } = this.issues;
    const start = after ? Number(after) : 0;
    if (!Number.isInteger(start) || start < 0) throw new Error(`Not a demo cursor: ${after}`);
    const nodes = all.slice(start, start + first);
    const end = start + nodes.length;
    return {
      issues: {
        nodes,
        // Like Linear, the last page still has a cursor unless it's empty.
        pageInfo: { hasNextPage: end < all.length, endCursor: nodes.length ? String(end) : null },
      },
    } satisfies OpenIssuesQuery;
  }

  /**
   * Like Linear's `issueUpdate` with a new assignee. Linear won't update an issue the viewer
   * can't see, or hand it to someone it doesn't know, and neither will the demo.
   */
  private reassign({ id, assigneeId }: ReassignIssueMutationVariables) {
    const demo = demoIssue(id);
    if (!demo) throw new Error("Linear API error: Entity not found: Issue");
    const member = demo.team.members.find((m) => m.id === assigneeId);
    if (!member) throw new Error("Linear API error: Entity not found: User");
    this.assignments.setAssignee(id, demo.issue.assignee?.id === member.id ? null : member.id);
    this.issues = undefined;
    const { id: teamId, name, key } = demo.team;
    const issue = this.teamIssues(this.today(), teamId).find((i) => i.id === id);
    return {
      issueUpdate: {
        success: true,
        issue: issue ? { ...issue, team: { id: teamId, name, key } } : null,
      },
    } satisfies ReassignIssueMutation;
  }

  /** A team's issues, with whoever the visitor handed each to. */
  private teamIssues(today: CalendarDate, teamId: string): IssueCard[] {
    const members = TEAMS.find(({ team }) => team.id === teamId)?.team.members ?? [];
    return demoIssues(today, teamId).map((issue) => {
      const userId = this.assignments.assignee(issue.id);
      const assignee = members.find((m) => m.id === userId);
      return assignee ? { ...issue, assignee } : issue;
    });
  }

  private today(): CalendarDate {
    return this.options.today ?? new Date().toISOString().slice(0, 10);
  }
}
