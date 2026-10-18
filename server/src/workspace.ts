// Linear as one GraphQL request sees it. Resolvers ask for the same teams and issues from
// several places (a team, each person on it, their matrix), so each is fetched once per
// request and shared. Batching across requests is DataLoader's job (#9).

import type { LinearPriority } from "./domain/quadrant";
import type { LinearSource } from "./linear/client";
import {
  TeamMembersDocument,
  type TeamSummaryFragment,
  TeamsDocument,
  ViewerDocument,
  type ViewerQuery,
} from "./linear/generated";
import { type Assignee, fetchTeamOpenIssues, type IssueCard } from "./linear/team-issues";

export type Team = TeamSummaryFragment;
export type Viewer = ViewerQuery["viewer"];

/** An open issue as the matrix reads it: Linear's priority is an Int, but only ever 0–4. */
export type TeamIssue = IssueCard & { priority: LinearPriority };

export interface TeamWork {
  /** Team members by name, then anyone else holding the team's issues, e.g. after moving teams. */
  people: Assignee[];
  issues: TeamIssue[];
  /** The same issues by assignee id; null holds the unassigned ones. */
  byAssignee: Map<string | null, TeamIssue[]>;
}

export class Workspace {
  private viewerLoad: Promise<Viewer> | undefined;
  private teamsLoad: Promise<{ all: Team[]; theirs: Set<string> }> | undefined;
  private readonly work = new Map<string, Promise<TeamWork>>();
  /** Teams fetched ahead that turned out not to be the viewer's: stop asking Linear about them. */
  private readonly abandoned = new Set<string>();

  constructor(private readonly linear: LinearSource) {}

  viewer(): Promise<Viewer> {
    this.viewerLoad ??= this.linear.request(ViewerDocument).then((r) => r.viewer);
    return this.viewerLoad;
  }

  /** Every team the viewer can see, by name. */
  async teams(): Promise<Team[]> {
    return (await this.loadTeams()).all;
  }

  /**
   * The team asked for, else the first the viewer is on, else the first by name, so a board
   * always has something to show. Null when there are no teams.
   */
  async team(id?: string | null): Promise<Team | null> {
    // Most loads ask for a team picked before, so fetch its work alongside the team list
    // rather than after it. If it turns out not to be one of theirs, it goes unused.
    if (id) this.teamWork(id).catch(() => {});
    const { all, theirs } = await this.loadTeams();
    const asked = all.find((t) => t.id === id);
    if (id && !asked) this.abandoned.add(id);
    return asked ?? all.find((t) => theirs.has(t.id)) ?? all[0] ?? null;
  }

  teamWork(teamId: string): Promise<TeamWork> {
    let load = this.work.get(teamId);
    if (!load) {
      load = this.loadTeamWork(teamId);
      this.work.set(teamId, load);
    }
    return load;
  }

  private loadTeams() {
    this.teamsLoad ??= this.linear.request(TeamsDocument).then(({ teams, viewer }) => ({
      all: teams.nodes.toSorted((a, b) => a.name.localeCompare(b.name)),
      // Teams lists every team the viewer can see, so default to one they're on.
      theirs: new Set(viewer.teams.nodes.map((t) => t.id)),
    }));
    return this.teamsLoad;
  }

  private async loadTeamWork(teamId: string): Promise<TeamWork> {
    // Checked before each request, so an abandoned prefetch stops paging.
    const linear: LinearSource = {
      request: (document, ...variables) =>
        this.abandoned.has(teamId)
          ? Promise.reject(new Error(`Team ${teamId} is no longer wanted`))
          : this.linear.request(document, ...variables),
    };
    const [{ team }, issues] = await Promise.all([
      linear.request(TeamMembersDocument, { teamId }),
      fetchTeamOpenIssues(linear, teamId),
    ]);
    const byName = (a: Assignee, b: Assignee) => a.name.localeCompare(b.name);
    const members = team.members.nodes.toSorted(byName);
    const memberIds = new Set(members.map((m) => m.id));
    const outsiders = new Map<string, Assignee>();
    const byAssignee = new Map<string | null, TeamIssue[]>();
    for (const issue of issues as TeamIssue[]) {
      const { assignee } = issue;
      if (assignee && !memberIds.has(assignee.id)) outsiders.set(assignee.id, assignee);
      const key = assignee?.id ?? null;
      const theirs = byAssignee.get(key);
      if (theirs) theirs.push(issue);
      else byAssignee.set(key, [issue]);
    }
    return {
      people: [...members, ...[...outsiders.values()].toSorted(byName)],
      issues: issues as TeamIssue[],
      byAssignee,
    };
  }
}
