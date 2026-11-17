// Time off: the days someone is away, as calendar dates, inclusive. Someone away all of a period
// has no share of its urgent load; someone away part of a forecast week has less of one.

import { describeCapacity, FULL_TIME } from "./capacity";
import { addDays, type CalendarDate } from "./quadrant";

/** One stretch of time off, first and last day included. */
export interface TimeOff {
  id: string;
  startsOn: CalendarDate;
  endsOn: CalendarDate;
}

/** Why someone is away for a whole period, and until when. */
export interface Away {
  /** Their last day away. */
  until: CalendarDate;
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

/** Working days in a week: a forecast week is any 7 days, so always holds 5. */
export const WORK_WEEK = 5;

/** The longest stretch of time off one entry can cover. */
export const MAX_TIME_OFF_DAYS = 366;

/** The most current and upcoming stretches one person can have. */
export const MAX_TIME_OFF = 8;

/**
 * Time off from a client: real dates, ending no earlier than it starts and no earlier than
 * today, and at most MAX_TIME_OFF_DAYS long.
 */
export function parseTimeOff(
  startsOn: CalendarDate,
  endsOn: CalendarDate,
  today: CalendarDate,
): { startsOn: CalendarDate; endsOn: CalendarDate } | { problem: string } {
  const problem = rangeProblem(startsOn, endsOn);
  if (problem) return { problem };
  if (endsOn < today) return { problem: "That time off is already over." };
  return { startsOn, endsOn };
}

/** What's wrong with a stretch of time off, whenever it is, or null if nothing. */
export function rangeProblem(startsOn: string, endsOn: string): string | null {
  if (!isDate(startsOn) || !isDate(endsOn)) return "Time off needs real dates, as YYYY-MM-DD.";
  if (endsOn < startsOn) return "Time off can't end before it starts.";
  if (daysBetween(startsOn, endsOn) >= MAX_TIME_OFF_DAYS) {
    return `One stretch of time off covers at most ${MAX_TIME_OFF_DAYS} days.`;
  }
  return null;
}

/** Whole days from one date to a later one: 0 for the same day. */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
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
 * meet or overlap, or only have a weekend between them, count as one.
 */
export function awayUntil(timeOff: readonly TimeOff[], on: CalendarDate): CalendarDate | null {
  if (!isOff(timeOff, on)) return null;
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
  return until === null ? { capacity } : { capacity, away: { until } };
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
    const until = awayUntil(timeOff, off[0] as CalendarDate) as CalendarDate;
    return { capacity, away: { until } };
  }
  const present = (workdays.length - off.length) / WORK_WEEK;
  return { capacity: Math.round(capacity * present * 100) / 100, daysOff: off.length };
}

/** E.g. "Away until Nov 20". */
export function describeAway({ until }: Away): string {
  return `Away until ${shortDate(until)}`;
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
