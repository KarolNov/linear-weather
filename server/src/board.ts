// The read-only board (#7): one Eisenhower matrix per team member, straight from the Linear
// client and the rules engine. #8 replaces this with derived fields on our GraphQL schema.

import {
  type CalendarDate,
  type Classification,
  classify,
  type LinearPriority,
  type Quadrant,
  type QuadrantRules,
} from "./domain/quadrant";
import type { LinearSource } from "./linear/client";
import { TeamMembersDocument, type TeamSummaryFragment, TeamsDocument } from "./linear/generated";
import {
  type Assignee,
  fetchTeamOpenIssues,
  groupByAssignee,
  type IssueCard,
} from "./linear/team-issues";

export type Team = TeamSummaryFragment;

export type BoardIssue = IssueCard & Classification;

export interface PersonMatrix {
  /** Null for the team's unassigned issues. */
  assignee: Assignee | null;
  counts: Record<Quadrant, number>;
  /** Most pressing first: by due date (undated last), then priority. */
  issues: BoardIssue[];
}

export interface Board {
  /** The day issues were classified against. */
  today: CalendarDate;
  /** Every team to pick from, by name. */
  teams: Team[];
  /**
   * The team shown: the one asked for, else the first the viewer is on, else the first.
   * Null when there are no teams.
   */
  team: Team | null;
  /** Team members by name, then anyone else holding the team's issues, then unassigned. */
  people: PersonMatrix[];
}

export interface BoardOptions {
  teamId?: string;
  today: CalendarDate;
  rules: QuadrantRules;
}

export async function loadBoard(
  linear: LinearSource,
  { teamId, today, rules }: BoardOptions,
): Promise<Board> {
  // Most loads ask for a team they picked before, so fetch it alongside the team list rather
  // than after it. If it turns out not to be one of theirs, it's dropped.
  const asked = teamId ? loadTeam(linear, teamId) : null;
  asked?.catch(() => {});
  const { teams, viewer } = await linear.request(TeamsDocument);
  const sorted = teams.nodes.toSorted((a, b) => a.name.localeCompare(b.name));
  // Teams lists every team the viewer can see, so default to one they're on.
  const theirs = new Set(viewer.teams.nodes.map((t) => t.id));
  const team =
    sorted.find((t) => t.id === teamId) ?? sorted.find((t) => theirs.has(t.id)) ?? sorted[0];
  if (!team) return { today, teams: [], team: null, people: [] };

  const { members, issues } = await (asked && team.id === teamId
    ? asked
    : loadTeam(linear, team.id));

  const groups = new Map(
    groupByAssignee(issues).map((group) => [group.assignee?.id ?? null, group]),
  );
  const byName = (a: Assignee, b: Assignee) => a.name.localeCompare(b.name);
  const memberIds = new Set(members.map((m) => m.id));
  // People can hold a team's issues without being on it, e.g. after moving teams.
  const outsiders = [...groups.values()]
    .flatMap((g) => (g.assignee && !memberIds.has(g.assignee.id) ? [g.assignee] : []))
    .toSorted(byName);
  const assignees = [...members.toSorted(byName), ...outsiders];

  const people = assignees.map((assignee) =>
    personMatrix(assignee, groups.get(assignee.id)?.issues ?? [], rules, today),
  );
  const unassigned = groups.get(null);
  if (unassigned) people.push(personMatrix(null, unassigned.issues, rules, today));

  return { today, teams: sorted, team, people };
}

async function loadTeam(linear: LinearSource, teamId: string) {
  const [{ team }, issues] = await Promise.all([
    linear.request(TeamMembersDocument, { teamId }),
    fetchTeamOpenIssues(linear, teamId),
  ]);
  return { members: team.members.nodes, issues };
}

function personMatrix(
  assignee: Assignee | null,
  issues: IssueCard[],
  rules: QuadrantRules,
  today: CalendarDate,
): PersonMatrix {
  const counts: Record<Quadrant, number> = { do: 0, schedule: 0, delegate: 0, drop: 0 };
  const classified = issues.map((issue) => {
    // Linear's priority is an Int in the schema, but only ever 0–4.
    const classification = classify(
      { dueDate: issue.dueDate, priority: issue.priority as LinearPriority },
      rules,
      today,
    );
    counts[classification.quadrant]++;
    return { ...issue, ...classification };
  });
  return { assignee, counts, issues: classified.toSorted(mostPressingFirst) };
}

function mostPressingFirst(a: IssueCard, b: IssueCard): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  // "No priority" (0) sorts after Low (4).
  return (a.priority || 5) - (b.priority || 5);
}
