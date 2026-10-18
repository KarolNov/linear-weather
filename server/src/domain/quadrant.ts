// Sorts an issue into an Eisenhower quadrant. Pure: rules are data and "today"
// is an argument, so the same inputs always give the same answer.

/** Linear's priority: 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low. */
export type LinearPriority = 0 | 1 | 2 | 3 | 4;

/** A calendar date as Linear sends `dueDate`: `YYYY-MM-DD`, no time or zone. */
export type CalendarDate = string;

export type Quadrant = "do" | "schedule" | "delegate" | "drop";

export interface QuadrantRules {
  /** Lowest priority that still counts as important. "No priority" never does. */
  importantFrom: Exclude<LinearPriority, 0>;
  /** An issue is urgent when it's due in fewer than this many days, or overdue. */
  urgencyWindowDays: number;
  /** Where issues without a due date land. */
  noDueDate: "urgent" | "notUrgent";
}

export const DEFAULT_RULES: QuadrantRules = {
  importantFrom: 3,
  urgencyWindowDays: 14,
  noDueDate: "notUrgent",
};

export interface ClassifiableIssue {
  priority: LinearPriority;
  dueDate: CalendarDate | null;
}

export interface Classification {
  quadrant: Quadrant;
  /** Human-readable why, e.g. "High priority, due in 3 days". */
  reason: string;
}

const PRIORITY_LABEL: Record<LinearPriority, string> = {
  0: "No priority",
  1: "Urgent priority",
  2: "High priority",
  3: "Medium priority",
  4: "Low priority",
};

export function classify(
  issue: ClassifiableIssue,
  rules: QuadrantRules,
  today: CalendarDate,
): Classification {
  const important = issue.priority !== 0 && issue.priority <= rules.importantFrom;
  const urgent = isUrgent(issue.dueDate, rules, today);
  const due =
    issue.dueDate === null ? "no due date" : describeDue(daysBetween(today, issue.dueDate));

  return {
    quadrant: important ? (urgent ? "do" : "schedule") : urgent ? "delegate" : "drop",
    reason: `${PRIORITY_LABEL[issue.priority]}, ${due}`,
  };
}

/**
 * The first day `classify()` will call this issue urgent, so the Forecast can
 * say when it moves. Urgency ignores priority, so only the due date matters.
 *
 * - Already urgent (due inside the window, or overdue) → `today`. Never a past
 *   date: the Forecast looks forward, and "urgent since" isn't its question.
 * - No due date → `null` (fog), unless the rules make undated issues urgent,
 *   in which case it's urgent now → `today`.
 */
export function becomesUrgentOn(
  issue: Pick<ClassifiableIssue, "dueDate">,
  rules: QuadrantRules,
  today: CalendarDate,
): CalendarDate | null {
  parseDate(today);
  if (isUrgent(issue.dueDate, rules, today)) return today;
  // Not urgent now and never will be: no due date, or a NaN / -Infinity window.
  if (issue.dueDate === null || !Number.isFinite(rules.urgencyWindowDays)) return null;
  return addDays(issue.dueDate, -lastUrgentDaysOut(rules));
}

/** The one definition of "urgent", shared by `classify()` and `becomesUrgentOn()`. */
function isUrgent(
  dueDate: CalendarDate | null,
  rules: QuadrantRules,
  today: CalendarDate,
): boolean {
  if (dueDate === null) return rules.noDueDate === "urgent";
  return daysBetween(today, dueDate) <= lastUrgentDaysOut(rules);
}

/**
 * The most whole days before the due date an issue can be and still be urgent.
 * Urgent means `days < window`, so with a 14-day window that's 13, not 14.
 */
function lastUrgentDaysOut(rules: QuadrantRules): number {
  return Math.ceil(rules.urgencyWindowDays) - 1;
}

function describeDue(days: number): string {
  if (days === 0) return "due today";
  if (days < 0) return `overdue by ${plural(-days, "day")}`;
  return `due in ${plural(days, "day")}`;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

const MS_PER_DAY = 86_400_000;

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return (parseDate(to) - parseDate(from)) / MS_PER_DAY;
}

/** The calendar date `days` after `date` (before, when negative). */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  return new Date(parseDate(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function parseDate(date: CalendarDate): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Expected a YYYY-MM-DD date, got "${date}"`);
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  // UTC midnight on both sides, so DST can't shift the difference. Not
  // Date.UTC(), which reads years 0–99 as 1900–1999.
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month, day);
  // Out-of-range parts roll over (Feb 31 → Mar 3), so check they survived.
  if (parsed.getUTCMonth() !== month || parsed.getUTCDate() !== day) {
    throw new RangeError(`No such date: "${date}"`);
  }
  return parsed.getTime();
}
