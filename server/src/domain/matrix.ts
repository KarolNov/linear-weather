// One person's Eisenhower matrix: their issues placed into quadrants, most pressing first.
// Pure, like the rules engine it builds on.

import {
  becomesUrgentOn,
  type CalendarDate,
  type ClassifiableIssue,
  classify,
  type LinearPriority,
  type Quadrant,
  type QuadrantRules,
} from "./quadrant";

/** Where an issue landed and why: by the team's rules, or by hand. */
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

/** Issue ids a PM placed by hand, and where. */
export type Overrides = ReadonlyMap<string, Quadrant>;

const QUADRANT_LABEL: Record<Quadrant, string> = {
  do: "Do",
  schedule: "Schedule",
  delegate: "Delegate",
  drop: "Drop",
};

/**
 * Places an issue by the rules, unless a PM placed it by hand. An override only moves the issue:
 * when it turns urgent still follows its due date.
 */
export function place<I extends MatrixIssue>(
  issue: I,
  rules: QuadrantRules,
  today: CalendarDate,
  override?: Quadrant,
): Placed<I> {
  const { quadrant, reason } = classify(issue, rules, today);
  return {
    ...issue,
    quadrant: override ?? quadrant,
    quadrantSource: override ? "override" : "rule",
    placementReason: override
      ? `Placed by hand; the rules say ${QUADRANT_LABEL[quadrant]} (${reason})`
      : reason,
    // Few clients ask for it, so work it out only when read.
    get becomesUrgentOn() {
      return becomesUrgentOn(issue, rules, today);
    },
  };
}

/** Sorts issues into quadrants, each most pressing first: by due date (undated last), then priority. */
export function buildMatrix<I extends MatrixIssue & { id: string }>(
  issues: I[],
  rules: QuadrantRules,
  today: CalendarDate,
  overrides: Overrides = new Map(),
): Matrix<I> {
  const matrix: Matrix<I> = { do: [], schedule: [], delegate: [], drop: [] };
  for (const issue of issues.toSorted(mostPressingFirst)) {
    const placed = place(issue, rules, today, overrides.get(issue.id));
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
  return byPriority(a.priority, b.priority);
}

/** Most important first: Urgent (1) to Low (4), then "No priority" (0). */
export function byPriority(a: LinearPriority, b: LinearPriority): number {
  return (a || 5) - (b || 5);
}
