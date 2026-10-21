// Linear as one GraphQL request sees it. Resolvers ask for the same teams and issues from
// several places (a team, each person on it, their matrix), so each is fetched once per
// request and shared. Resolvers for different teams ask in the same tick, so DataLoader
// batches them: one members query and one issues query cover every team on the page.

import DataLoader from "dataloader";
import type { LinearPriority } from "./domain/quadrant";
import type { LinearSource } from "./linear/client";
import {
  type TeamSummaryFragment,
  TeamsDocument,
  TeamsMembersDocument,
  ViewerDocument,
  type ViewerQuery,
} from "./linear/generated";
import { type Assignee, fetchOpenIssues, type IssueCard } from "./linear/team-issues";

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

// The members query costs ~330 complexity points a team, so 10 teams stay well under Linear's
// 10,000 cap on one query. Issues are paged at a fixed cost however many teams they cover.
const TEAMS_PER_BATCH = 10;

export class Workspace {
  private viewerLoad: Promise<Viewer> | undefined;
  private teamsLoad: Promise<{ all: Team[]; theirs: Set<string> }> | undefined;
  private readonly work = new Map<string, Promise<TeamWork>>();
  /** Teams fetched ahead that turned out not to be the viewer's: stop asking Linear about them. */
  private readonly abandoned = new Set<string>();
  private readonly members = new DataLoader<string, Assignee[]>(
    (teamIds) => this.loadMembers(teamIds),
    { maxBatchSize: TEAMS_PER_BATCH },
  );
  private readonly openIssues = new DataLoader<string, IssueCard[]>(
    (teamIds) => this.loadOpenIssues(teamIds),
    { maxBatchSize: TEAMS_PER_BATCH },
  );

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
    const [team, issues] = await Promise.all([
      this.members.load(teamId),
      this.openIssues.load(teamId),
    ]);
    const byName = (a: Assignee, b: Assignee) => a.name.localeCompare(b.name);
    const members = team.toSorted(byName);
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

  /** Each team's members, in the order asked. A team the viewer can't see is an error. */
  private async loadMembers(teamIds: readonly string[]): Promise<(Assignee[] | Error)[]> {
    const { teams } = await this.wanted(teamIds).request(TeamsMembersDocument, {
      teamIds: [...teamIds],
      first: teamIds.length,
    });
    const byTeam = new Map(teams.nodes.map((t) => [t.id, t.members.nodes]));
    return teamIds.map((id) => byTeam.get(id) ?? new Error(`Entity not found: Team ${id}`));
  }

  /** Each team's open issues, in the order asked, from one paged query. */
  private async loadOpenIssues(teamIds: readonly string[]): Promise<IssueCard[][]> {
    const byTeam = new Map<string, IssueCard[]>(teamIds.map((id) => [id, []]));
    for (const { team, ...issue } of await fetchOpenIssues(this.wanted(teamIds), teamIds)) {
      byTeam.get(team.id)?.push(issue);
    }
    return teamIds.map((id) => byTeam.get(id) ?? []);
  }

  /**
   * Linear, for as long as some of these teams are still wanted. Checked before each request,
   * so a batch holding only an abandoned prefetch stops paging.
   */
  private wanted(teamIds: readonly string[]): LinearSource {
    return {
      request: (document, ...variables) =>
        teamIds.every((id) => this.abandoned.has(id))
          ? Promise.reject(new Error(`Teams ${teamIds.join(", ")} are no longer wanted`))
          : this.linear.request(document, ...variables),
    };
  }
}
