import { type LinearClient, LinearRateLimitError } from "./client";
import {
  type IssueCardFragment,
  TeamOpenIssuesDocument,
  type TeamOpenIssuesQuery,
} from "./generated";

export type IssueCard = IssueCardFragment;
export type Assignee = NonNullable<IssueCard["assignee"]>;

// Linear's largest page. About 4 points per issue, so ~1,000 per page: well under the 10,000
// cap on a single query, and big pages mean fewer requests against the hourly request limit.
export const PAGE_SIZE = 250;

/** Every open issue in the team, following Linear's cursor pagination to the end. */
export async function fetchTeamOpenIssues(
  linear: LinearClient,
  teamId: string,
): Promise<IssueCard[]> {
  const issues: IssueCard[] = [];
  let after: string | null = null;
  for (;;) {
    const page: TeamOpenIssuesQuery = await linear.request(TeamOpenIssuesDocument, {
      teamId,
      first: PAGE_SIZE,
      after,
    });
    issues.push(...page.issues.nodes);
    const { hasNextPage, endCursor } = page.issues.pageInfo;
    if (!hasNextPage || !endCursor) return issues;
    after = endCursor;

    // Don't send a page Linear will reject: if what's left can't cover what the last one
    // cost, stop now rather than burn requests on rate-limit errors.
    const { complexity, complexityRemaining, resetAt } = linear.rateLimit ?? {};
    if (complexity != null && complexityRemaining != null && complexityRemaining < complexity) {
      throw new LinearRateLimitError(resetAt ?? null);
    }
  }
}

export interface AssigneeIssues {
  /** Null for issues nobody is assigned to. */
  assignee: Assignee | null;
  issues: IssueCard[];
}

/** Groups issues by assignee, in order of first appearance; unassigned issues come last. */
export function groupByAssignee(issues: IssueCard[]): AssigneeIssues[] {
  const groups = new Map<string | null, AssigneeIssues>();
  for (const issue of issues) {
    const key = issue.assignee?.id ?? null;
    let group = groups.get(key);
    if (!group) {
      group = { assignee: issue.assignee ?? null, issues: [] };
      groups.set(key, group);
    }
    group.issues.push(issue);
  }
  const unassigned = groups.get(null);
  groups.delete(null);
  return unassigned ? [...groups.values(), unassigned] : [...groups.values()];
}
