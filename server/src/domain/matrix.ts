// One person's Eisenhower matrix: their issues placed into quadrants, most pressing first.
// Pure, like the rules engine it builds on.

import {
  becomesUrgentOn,
  type CalendarDate,
  type ClassifiableIssue,
  classify,
  type Quadrant,
  type QuadrantRules,
} from "./quadrant";

/** Where an issue landed and why. Overrides come with #10; until then every placement is a rule's. */
export interface Placement {
  quadrant: Quadrant;
  quadrantSource: "rule" | "override";
  placementReason: string;
  becomesUrgentOn: CalendarDate | null;
}

/** What placing an issue reads, plus `estimate` for the points tally. */
export interface MatrixIssue extends ClassifiableIssue {
  estimate?: number | null;
}

export type Placed<I> = I & Placement;

export type Matrix<I> = Record<Quadrant, Placed<I>[]>;

export function place<I extends MatrixIssue>(
  issue: I,
  rules: QuadrantRules,
  today: CalendarDate,
): Placed<I> {
  const { quadrant, reason } = classify(issue, rules, today);
  return {
    ...issue,
    quadrant,
    quadrantSource: "rule",
    placementReason: reason,
    becomesUrgentOn: becomesUrgentOn(issue, rules, today),
  };
}

/** Sorts issues into quadrants, each most pressing first: by due date (undated last), then priority. */
export function buildMatrix<I extends MatrixIssue>(
  issues: I[],
  rules: QuadrantRules,
  today: CalendarDate,
): Matrix<I> {
  const matrix: Matrix<I> = { do: [], schedule: [], delegate: [], drop: [] };
  for (const issue of issues.toSorted(mostPressingFirst)) {
    const placed = place(issue, rules, today);
    matrix[placed.quadrant].push(placed);
  }
  return matrix;
}

export function counts(matrix: Matrix<MatrixIssue>): Record<Quadrant, number> {
  return tally(matrix, () => 1);
}

/** Estimate points per quadrant; unestimated issues add nothing. */
export function points(matrix: Matrix<MatrixIssue>): Record<Quadrant, number> {
  return tally(matrix, (issue) => issue.estimate ?? 0);
}

function tally(
  matrix: Matrix<MatrixIssue>,
  value: (issue: MatrixIssue) => number,
): Record<Quadrant, number> {
  const sum = (q: Quadrant) => matrix[q].reduce((total, issue) => total + value(issue), 0);
  return { do: sum("do"), schedule: sum("schedule"), delegate: sum("delegate"), drop: sum("drop") };
}

function mostPressingFirst(a: ClassifiableIssue, b: ClassifiableIssue): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  // "No priority" (0) sorts after Low (4).
  return (a.priority || 5) - (b.priority || 5);
}
