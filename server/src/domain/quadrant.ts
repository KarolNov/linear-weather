// Sorts an issue into an Eisenhower quadrant. Pure: rules are data and "today"
// is an argument, so the same inputs always give the same answer.

/** Linear's priority: 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low. */
export type LinearPriority = 0 | 1 | 2 | 3 | 4;

/** A calendar date as Linear sends `dueDate`: `YYYY-MM-DD`, no time or zone. */
export type CalendarDate = string;

export const QUADRANTS = ["do", "schedule", "delegate", "drop"] as const;

export type Quadrant = (typeof QUADRANTS)[number];

/** Where issues without a due date can land. */
export const NO_DUE_DATE = ["urgent", "notUrgent"] as const;

export interface QuadrantRules {
  /** Lowest priority that still counts as important. "No priority" never does. */
  importantFrom: Exclude<LinearPriority, 0>;
  /** An issue is urgent when it's due in fewer than this many days, or overdue. */
  urgencyWindowDays: number;
  /** Where issues without a due date land. */
  noDueDate: (typeof NO_DUE_DATE)[number];
  /** The team is flagged for backlog rot when more than this percent of its open issues are in Drop. */
  dropAlertPercent: number;
  /**
   * Linear statuses that mean someone is away: an entry matches a status whose label holds it, or
   * whose emoji is among the entry's ("🌴🏖️" matches 🌴), ignoring case. Empty unless a team opts in.
   */
  awayStatuses: readonly string[];
  /** An issue that blocks another, still open, counts as important whatever its priority. */
  blockersAreImportant: boolean;
  /** An issue in its team's current cycle counts as urgent whatever its due date. */
  currentCycleIsUrgent: boolean;
}

export const DEFAULT_RULES: QuadrantRules = {
  importantFrom: 3,
  urgencyWindowDays: 14,
  noDueDate: "notUrgent",
  dropAlertPercent: 40,
  awayStatuses: [],
  blockersAreImportant: false,
  currentCycleIsUrgent: false,
};

/** Whether two teams' rules are the same, lists compared by what they hold. */
export function sameRules(a: QuadrantRules, b: QuadrantRules): boolean {
  return (Object.keys(DEFAULT_RULES) as (keyof QuadrantRules)[]).every((key) => {
    const [x, y] = [a[key], b[key]];
    return Array.isArray(x) && Array.isArray(y)
      ? x.length === y.length && x.every((item, i) => item === y[i])
      : x === y;
  });
}

/** The most away statuses a team can list. */
export const MAX_AWAY_STATUSES = 10;

/** The longest away status, in characters: about as long as a Linear status label. */
export const MAX_AWAY_STATUS_LENGTH = 40;

/** The longest urgency window a team can pick. Past a year, every dated issue is urgent anyway. */
export const MAX_URGENCY_WINDOW_DAYS = 365;

/** Something wrong with proposed rules, on the field a settings form would mark. */
export interface RuleProblem {
  field: "importantFrom" | "urgencyWindowDays" | "dropAlertPercent" | "awayStatuses";
  message: string;
}

/** Proposed rules: like QuadrantRules, but `importantFrom` not yet known to be a priority. */
export type RulesInput = Omit<QuadrantRules, "importantFrom"> & { importantFrom: number };

/**
 * These rules as `classify()` can use them, or everything wrong with them. Nothing gets past
 * without being checked, so callers never assert the type themselves.
 */
export function parseRules(
  input: RulesInput,
): { rules: QuadrantRules; problems?: never } | { rules?: never; problems: RuleProblem[] } {
  const {
    importantFrom,
    urgencyWindowDays,
    noDueDate,
    dropAlertPercent,
    blockersAreImportant,
    currentCycleIsUrgent,
  } = input;
  const awayStatuses = tidyAwayStatuses(input.awayStatuses);
  const problems: RuleProblem[] = [];
  if (!isImportantFrom(importantFrom)) {
    problems.push({
      field: "importantFrom",
      message: "Important from must be a priority: 1 (Urgent) to 4 (Low).",
    });
  }
  if (
    !Number.isInteger(urgencyWindowDays) ||
    urgencyWindowDays < 1 ||
    urgencyWindowDays > MAX_URGENCY_WINDOW_DAYS
  ) {
    problems.push({
      field: "urgencyWindowDays",
      message: `The urgency window must be 1 to ${MAX_URGENCY_WINDOW_DAYS} whole days.`,
    });
  }
  if (!Number.isInteger(dropAlertPercent) || dropAlertPercent < 1 || dropAlertPercent > 99) {
    problems.push({
      field: "dropAlertPercent",
      message: "The Drop alert must be 1 to 99 whole percent.",
    });
  }
  if (awayStatuses.length > MAX_AWAY_STATUSES) {
    problems.push({
      field: "awayStatuses",
      message: `List at most ${MAX_AWAY_STATUSES} away statuses.`,
    });
  }
  if (awayStatuses.some((status) => [...status].length > MAX_AWAY_STATUS_LENGTH)) {
    problems.push({
      field: "awayStatuses",
      message: `An away status is at most ${MAX_AWAY_STATUS_LENGTH} characters.`,
    });
  }
  if (problems.length === 0 && isImportantFrom(importantFrom)) {
    return {
      rules: {
        importantFrom,
        urgencyWindowDays,
        noDueDate,
        dropAlertPercent,
        awayStatuses,
        blockersAreImportant,
        currentCycleIsUrgent,
      },
    };
  }
  return { problems };
}

/**
 * Away statuses as a team keeps them: trimmed, blanks dropped, and each kept once, ignoring case,
 * since matching does.
 */
function tidyAwayStatuses(statuses: readonly string[]): string[] {
  const seen = new Set<string>();
  const tidy: string[] = [];
  for (const status of statuses) {
    const trimmed = status.trim();
    const key = trimmed.toLowerCase();
    if (trimmed === "" || seen.has(key)) continue;
    seen.add(key);
    tidy.push(trimmed);
  }
  return tidy;
}

function isImportantFrom(priority: number): priority is QuadrantRules["importantFrom"] {
  return Number.isInteger(priority) && priority >= 1 && priority <= 4;
}

export interface ClassifiableIssue {
  priority: LinearPriority;
  dueDate: CalendarDate | null;
  /**
   * Blocks another issue that's still open. Only read when the rules count blockers as important,
   * and only looked up in Linear then, so left out it means "not asked", read as not blocking.
   */
  blocking?: boolean;
  /**
   * In its team's cycle that's running now. Only read when the rules count those as urgent, and
   * only looked up in Linear then, so left out it means "not asked", read as not in it.
   */
  inCurrentCycle?: boolean;
  /** The current cycle's last day, when it's in one; left out, the cycle is read as not ending. */
  currentCycleEndsOn?: CalendarDate;
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
  const blocker = rules.blockersAreImportant && issue.blocking === true;
  const important = (issue.priority !== 0 && issue.priority <= rules.importantFrom) || blocker;
  const cycle = inCycle(issue, rules, today);
  const urgent = isUrgentOn(issue, rules, today);
  const due =
    issue.dueDate === null ? "no due date" : describeDue(daysBetween(today, issue.dueDate));

  return {
    quadrant: important ? (urgent ? "do" : "schedule") : urgent ? "delegate" : "drop",
    reason: [
      PRIORITY_LABEL[issue.priority],
      ...(blocker ? ["blocks other issues"] : []),
      due,
      ...(cycle ? ["in the current cycle"] : []),
    ].join(", "),
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
 * - In the current cycle, when the rules count that as urgent → `today`. When
 *   the cycle ends it stops being urgent for that (`isUrgentOn()` says when).
 */
export function becomesUrgentOn(
  issue: UrgencyFacts,
  rules: QuadrantRules,
  today: CalendarDate,
): CalendarDate | null {
  parseDate(today);
  if (isUrgentOn(issue, rules, today)) return today;
  // Not urgent now and never will be: no due date, or a NaN / -Infinity window.
  if (issue.dueDate === null || !Number.isFinite(rules.urgencyWindowDays)) return null;
  return addDays(issue.dueDate, -lastUrgentDaysOut(rules));
}

type UrgencyFacts = Pick<ClassifiableIssue, "dueDate" | "inCurrentCycle" | "currentCycleEndsOn">;

/**
 * The one definition of "urgent" on a given day, shared by `classify()`, `becomesUrgentOn()` and
 * the Forecast: due inside the window (or overdue, or undated when the rules say so), or in the
 * current cycle until it ends, when the rules count that.
 */
export function isUrgentOn(issue: UrgencyFacts, rules: QuadrantRules, day: CalendarDate): boolean {
  if (inCycle(issue, rules, day)) return true;
  if (issue.dueDate === null) return rules.noDueDate === "urgent";
  return daysBetween(day, issue.dueDate) <= lastUrgentDaysOut(rules);
}

/** Whether the issue is urgent on `day` for being in the current cycle, by these rules. */
function inCycle(issue: UrgencyFacts, rules: QuadrantRules, day: CalendarDate): boolean {
  return (
    rules.currentCycleIsUrgent &&
    issue.inCurrentCycle === true &&
    (issue.currentCycleEndsOn === undefined || day <= issue.currentCycleEndsOn)
  );
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
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
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
