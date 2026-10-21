import type { LinearSource } from "./client";
import { type IssueCardFragment, OpenIssuesDocument, type OpenIssuesQuery } from "./generated";

export type IssueCard = IssueCardFragment;
export type Assignee = NonNullable<IssueCard["assignee"]>;
/** An open issue, with the team it belongs to. */
export type OpenIssue = OpenIssuesQuery["issues"]["nodes"][number];

// Linear's largest page. About 5 points per issue, so ~1,300 per page: well under the 10,000
// cap on a single query, and big pages mean fewer requests against the hourly request limit.
export const PAGE_SIZE = 250;

/**
 * Every open issue in these teams, following Linear's cursor pagination to the end. One
 * query covers all the teams, so asking for more teams costs pages, not requests per team.
 * The real client paces the pages to Linear's rate limit.
 */
export async function fetchOpenIssues(
  linear: LinearSource,
  teamIds: readonly string[],
): Promise<OpenIssue[]> {
  const issues: OpenIssue[] = [];
  let after: string | null = null;
  for (;;) {
    const page: OpenIssuesQuery = await linear.request(OpenIssuesDocument, {
      teamIds: [...teamIds],
      first: PAGE_SIZE,
      after,
    });
    issues.push(...page.issues.nodes);
    const { hasNextPage, endCursor } = page.issues.pageInfo;
    if (!hasNextPage) return issues;
    if (!endCursor) throw new Error("Linear reported more issues but no cursor to fetch them");
    after = endCursor;
  }
}
