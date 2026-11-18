import type { LinearSource } from "./client";
import {
  type BlockingFragment,
  type IssueCardFragment,
  OpenBlockersDocument,
  type OpenBlockersQuery,
  OpenIssuesDocument,
  type OpenIssuesQuery,
} from "./generated";

export type IssueCard = IssueCardFragment;
export type Assignee = NonNullable<IssueCard["assignee"]>;
/** An open issue, with the team it belongs to. */
export type OpenIssue = OpenIssuesQuery["issues"]["nodes"][number];
/** An open issue Linear says blocks another, with what it blocks. */
export type OpenBlocker = OpenBlockersQuery["issues"]["nodes"][number];

// Linear's largest page. About 5.6 points per issue, so ~1,400 per page: well under the 10,000
// cap on a single query, and big pages mean fewer requests against the hourly request limit.
export const PAGE_SIZE = 250;

// Each blocker brings up to 20 relations at ~65 points, so a page of 100 is ~6,500.
export const BLOCKERS_PAGE_SIZE = 100;

/** Linear's state types for work that's over. */
const DONE = new Set(["completed", "canceled"]);

/**
 * Every open issue in these teams, following Linear's cursor pagination to the end. One
 * query covers all the teams, so asking for more teams costs pages, not requests per team.
 * The real client paces the pages to Linear's rate limit.
 */
export function fetchOpenIssues(
  linear: LinearSource,
  teamIds: readonly string[],
): Promise<OpenIssue[]> {
  return allPages((after) =>
    linear
      .request(OpenIssuesDocument, { teamIds: [...teamIds], first: PAGE_SIZE, after })
      .then((page) => page.issues),
  );
}

/**
 * The open issues in these teams that Linear says block another. Some may only block work that's
 * done since: check with `blocksOpenWork`.
 */
export function fetchOpenBlockers(
  linear: LinearSource,
  teamIds: readonly string[],
): Promise<OpenBlocker[]> {
  return allPages((after) =>
    linear
      .request(OpenBlockersDocument, { teamIds: [...teamIds], first: BLOCKERS_PAGE_SIZE, after })
      .then((page) => page.issues),
  );
}

/**
 * Whether the issue blocks another that isn't completed or canceled yet. Only its first relations
 * are read, so when none of those is an open block but there are more, it says so in the log.
 */
export function blocksOpenWork(issue: { id: string } & BlockingFragment): boolean {
  const { nodes, pageInfo } = issue.relations;
  const blocks = nodes.some(
    ({ type, relatedIssue }) => type === "blocks" && !DONE.has(relatedIssue.state.type),
  );
  if (!blocks && pageInfo.hasNextPage) {
    console.warn(
      `Linear issue ${issue.id} has more than ${nodes.length} relations; only those were checked for open work it blocks`,
    );
  }
  return blocks;
}

/** Follows a Linear connection's cursor to its last page. */
async function allPages<T>(
  page: (after: string | null) => Promise<{
    nodes: T[];
    pageInfo: { hasNextPage: boolean; endCursor?: string | null };
  }>,
): Promise<T[]> {
  const all: T[] = [];
  let after: string | null = null;
  for (;;) {
    const { nodes, pageInfo } = await page(after);
    all.push(...nodes);
    if (!pageInfo.hasNextPage) return all;
    if (!pageInfo.endCursor)
      throw new Error("Linear reported more issues but no cursor to fetch them");
    after = pageInfo.endCursor;
  }
}
