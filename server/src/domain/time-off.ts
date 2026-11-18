// Time off: the days someone is away, as calendar dates, inclusive. Someone away all of a period
// has no share of its urgent load; someone away part of a forecast week has less of one.

import { describeCapacity, FULL_TIME } from "./capacity";
import { addDays, type CalendarDate, daysBetween } from "./quadrant";

/** One stretch of time off, first and last day included. */
export interface TimeOff {
  id: string;
  startsOn: CalendarDate;
  endsOn: CalendarDate;
  /** Where it comes from, when not time off added on the board, e.g. "Linear status 🌴 On vacation". */
  source?: string;
}

/** Why someone is away for a whole period, and until when. */
export interface Away {
  /** Their last day away. */
  until: CalendarDate;
  /**
   * What says they're away, when something besides time off added on the board does, e.g.
   * ["time off", "Linear status 🌴 On vacation"].
   */
  sources?: string[];
}

/** How much someone can carry over a period, their time off taken into account. */
export interface Staffing {
  /** Their capacity, less the working days they're off. */
  capacity: number;
  /** Set when they're away all of the period: they have no share of its load. */
  away?: Away;
  /** Working days off in the period, when some but not all. */
  daysOff?: number;
}

/** The least capacity anyone has: a hundredth of full time, as parseCapacity rounds it. */
const MIN_CAPACITY = 0.01;

/** Working days in a week: a forecast week is any 7 days, so always holds 5. */
export const WORK_WEEK = 5;

/** The longest stretch of time off one entry can cover. */
export const MAX_TIME_OFF_DAYS = 366;

/** The most current and upcoming stretches one person can have. */
export const MAX_TIME_OFF = 8;

/**
 * Time off from a client: real dates, ending no earlier than it starts and no earlier than
 * today, and at most `maxDays` long (MAX_TIME_OFF_DAYS unless the store keeps less).
 */
export function parseTimeOff(
  startsOn: CalendarDate,
  endsOn: CalendarDate,
  today: CalendarDate,
  maxDays = MAX_TIME_OFF_DAYS,
): { startsOn: CalendarDate; endsOn: CalendarDate } | { problem: string } {
  const problem = rangeProblem(startsOn, endsOn, maxDays);
  if (problem) return { problem };
  if (endsOn < today) return { problem: "That time off is already over." };
  return { startsOn, endsOn };
}

/** What's wrong with a stretch of time off, whenever it is, or null if nothing. */
export function rangeProblem(
  startsOn: string,
  endsOn: string,
  maxDays = MAX_TIME_OFF_DAYS,
): string | null {
  if (!isDate(startsOn) || !isDate(endsOn)) return "Time off needs real dates, as YYYY-MM-DD.";
  if (endsOn < startsOn) return "Time off can't end before it starts.";
  if (daysBetween(startsOn, endsOn) >= maxDays) {
    return `One stretch of time off covers at most ${maxDays} days.`;
  }
  return null;
}

/** Time off not over by `today`, soonest first. */
export function upcoming(timeOff: readonly TimeOff[], today: CalendarDate): TimeOff[] {
  return soonestFirst(timeOff.filter(({ endsOn }) => endsOn >= today));
}

/** Time off by its first day, then its last. */
export function soonestFirst(timeOff: readonly TimeOff[]): TimeOff[] {
  return [...timeOff].sort(
    (a, b) => cmp(a.startsOn, b.startsOn) || cmp(a.endsOn, b.endsOn) || cmp(a.id, b.id),
  );
}

/**
 * The last day of the time off `on` falls in, or null if they aren't off that day. Stretches that
 * meet or overlap, or only have a weekend between them, count as one, so a weekend between two
 * of them is time off too.
 */
export function awayUntil(timeOff: readonly TimeOff[], on: CalendarDate): CalendarDate | null {
  if (!isOff(timeOff, on)) {
    if (!isWeekend(on)) return null;
    // Away over the weekend if the time off they're on by the last working day runs past it.
    let workday = addDays(on, -1);
    while (isWeekend(workday)) workday = addDays(workday, -1);
    const until = isOff(timeOff, workday) ? awayUntil(timeOff, workday) : null;
    return until !== null && until > on ? until : null;
  }
  let last = on;
  // A stretch is at most a year, and one may follow another; stop well past any real leave.
  for (let day = addDays(on, 1), i = 0; i < 4 * MAX_TIME_OFF_DAYS; day = addDays(day, 1), i++) {
    // Jump to the end of whichever stretch covers the day, rather than walking it.
    const covering = timeOff.filter(({ startsOn, endsOn }) => startsOn <= day && day <= endsOn);
    if (covering.length > 0) {
      last = covering.map(({ endsOn }) => endsOn).reduce((a, b) => (a > b ? a : b));
      day = last;
    } else if (!isWeekend(day)) break;
  }
  return last;
}

/** Someone's staffing on one day: away or not, at their capacity. */
export function staffingOn(
  capacity: number = FULL_TIME,
  timeOff: readonly TimeOff[] = [],
  on: CalendarDate,
): Staffing {
  const until = awayUntil(timeOff, on);
  return until === null ? { capacity } : { capacity, away: awayFrom(timeOff, on, until) };
}

/**
 * Someone's staffing over a forecast week: their capacity times the share of its working days
 * they're present. Away all of them, they're away.
 */
export function staffingFor(
  capacity: number = FULL_TIME,
  timeOff: readonly TimeOff[] = [],
  startsOn: CalendarDate,
  endsOn: CalendarDate,
): Staffing {
  const workdays = days(startsOn, endsOn).filter((day) => !isWeekend(day));
  const off = workdays.filter((day) => isOff(timeOff, day));
  if (off.length === 0) return { capacity };
  if (off.length === workdays.length) {
    const first = off[0] as CalendarDate;
    const until = awayUntil(timeOff, first) as CalendarDate;
    return { capacity, away: awayFrom(timeOff, first, until) };
  }
  const present = (workdays.length - off.length) / WORK_WEEK;
  // To the hundredth, like any capacity, but never 0: they're there some of the week.
  const reduced = Math.max(MIN_CAPACITY, Math.round(capacity * present * 100) / 100);
  return { capacity: reduced, daysOff: off.length };
}

/**
 * Away from `from` to `until`, naming what says so when anything besides time off added on the
 * board does.
 */
function awayFrom(timeOff: readonly TimeOff[], from: CalendarDate, until: CalendarDate): Away {
  const covering = timeOff.filter(({ startsOn, endsOn }) => startsOn <= until && endsOn >= from);
  if (covering.every(({ source }) => source === undefined)) return { until };
  const sources = [...new Set(covering.map(({ source }) => source ?? "time off"))];
  // Time off added on the board first, as the board lists it.
  sources.sort((a, b) => Number(a !== "time off") - Number(b !== "time off"));
  return { until, sources };
}

/** E.g. "Away until Nov 20", or "Away until Nov 20 (Linear status 🌴 On vacation)". */
export function describeAway({ until, sources }: Away): string {
  const why = sources?.length ? ` (${sources.join(" and ")})` : "";
  return `Away until ${shortDate(until)}${why}`;
}

/** E.g. " at 60% time (2 days off)", or "" for full time. */
export function describeStaffing(capacity: number, daysOff = 0): string {
  if (capacity === FULL_TIME && daysOff === 0) return "";
  const off = daysOff === 0 ? "" : ` (${daysOff} ${daysOff === 1 ? "day" : "days"} off)`;
  return ` at ${describeCapacity(capacity)}${off}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** E.g. "Nov 20". */
export function shortDate(date: CalendarDate): string {
  const [, month, day] = date.split("-");
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`;
}

function isOff(timeOff: readonly TimeOff[], day: CalendarDate): boolean {
  return timeOff.some(({ startsOn, endsOn }) => startsOn <= day && day <= endsOn);
}

function isWeekend(day: CalendarDate): boolean {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function days(from: CalendarDate, to: CalendarDate): CalendarDate[] {
  const all: CalendarDate[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) all.push(day);
  return all;
}

function isDate(date: string): boolean {
  try {
    return addDays(date, 0) === date;
  } catch {
    return false;
  }
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
