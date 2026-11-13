// Backlog rot: when too much of a team's open work sits in Drop (neither important nor urgent),
// the backlog is filling with things nobody means to do. Pure, like the rules engine.

import type { Quadrant } from "./quadrant";

export interface BacklogRot {
  /** Open issues in Drop, across the team's people and its unassigned issues. */
  drop: number;
  /** All the team's open issues. */
  total: number;
  /** Drop's share of them, 0 to 1. 0 when the team has no open issues. */
  share: number;
  /** The team's alert threshold, in percent. */
  alertPercent: number;
  /** More than `alertPercent` of the open issues are in Drop. */
  rotting: boolean;
  /** E.g. "12 of 20 open issues (60%) are in Drop, over the team's 40% alert". */
  reason: string;
}

/**
 * Whether a team's backlog is rotting, from the issue counts of every matrix it has (each person's
 * and the unassigned one). Counted in issues, not points: Drop work is rarely estimated.
 * The share is compared as a whole percent, as the reason shows it, so the flag never disagrees
 * with the number beside it.
 */
export function backlogRot(
  matrices: readonly Record<Quadrant, number>[],
  alertPercent: number,
): BacklogRot {
  let drop = 0;
  let total = 0;
  for (const counts of matrices) {
    drop += counts.drop;
    total += counts.do + counts.schedule + counts.delegate + counts.drop;
  }
  const share = total === 0 ? 0 : drop / total;
  const percent = Math.round(share * 100);
  const rotting = percent > alertPercent;
  const reason =
    total === 0
      ? "No open issues"
      : `${drop} of ${total} open ${total === 1 ? "issue" : "issues"} (${percent}%) ${
          drop === 1 ? "is" : "are"
        } in Drop, ${rotting ? "over" : "within"} the team's ${alertPercent}% alert`;
  return { drop, total, share, alertPercent, rotting, reason };
}
