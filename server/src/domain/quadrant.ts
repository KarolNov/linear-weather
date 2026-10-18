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

  let urgent: boolean;
  let due: string;
  if (issue.dueDate === null) {
    urgent = rules.noDueDate === "urgent";
    due = "no due date";
  } else {
    const days = daysBetween(today, issue.dueDate);
    urgent = days < rules.urgencyWindowDays;
    due = describeDue(days);
  }

  return {
    quadrant: important ? (urgent ? "do" : "schedule") : urgent ? "delegate" : "drop",
    reason: `${PRIORITY_LABEL[issue.priority]}, ${due}`,
  };
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

function parseDate(date: CalendarDate): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Expected a YYYY-MM-DD date, got "${date}"`);
  // UTC midnight on both sides, so DST can't shift the difference.
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
