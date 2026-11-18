// Away statuses: someone's Linear status (🌴 On vacation) can say they're away, when their team
// lists it in its rules. A matching status reads as time off from today to when it clears, so the
// weather, forecast and rebalance treat it like time off added on the board.

import { addDays, type CalendarDate } from "./quadrant";
import type { TimeOff } from "./time-off";

/** Someone's status as Linear keeps it on the user. */
export interface LinearStatus {
  statusEmoji?: string | null;
  statusLabel?: string | null;
  /** When Linear clears the status, as an ISO date-time; null when it doesn't. */
  statusUntilAt?: string | null;
  /** Their IANA time zone, e.g. "Europe/Zagreb". */
  timezone?: string | null;
}

/** The id of the time off a status stands for. Never one the store hands out: those are UUIDs. */
export const STATUS_TIME_OFF_ID = "linear-status";

/**
 * Whether a status is one of a team's away statuses, ignoring case. An entry matches when its
 * words appear in the status's label, or when the status's emoji is among the entry's: "🌴",
 * "🌴🏖️✈️" and "🌴 🤒" all match 🌴. Linear shortcodes like ":palm_tree:" count as emojis too.
 */
export function isAwayStatus(status: LinearStatus, awayStatuses: readonly string[]): boolean {
  const emoji = status.statusEmoji?.trim().toLowerCase() ?? "";
  const label = status.statusLabel?.toLowerCase() ?? "";
  return awayStatuses.some((entry) => {
    const wanted = entry.trim().toLowerCase();
    if (wanted === "") return false;
    if (label.includes(wanted)) return true;
    return emoji !== "" && (wanted === emoji || (emojisIn(wanted)?.includes(emoji) ?? false));
  });
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** An emoji (with any skin tone, variation selector or ZWJ parts), or a flag. */
const EMOJI = /^(\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Component})+$/u;

/**
 * The emojis an entry lists, when it's made of nothing else (spaces and commas between them
 * allowed); null when it holds words.
 */
export function emojisIn(entry: string): string[] | null {
  const emojis: string[] = [];
  for (const token of entry.split(/[\s,]+/).filter(Boolean)) {
    if (/^:[\w+-]+:$/.test(token)) {
      emojis.push(token);
      continue;
    }
    for (const { segment } of graphemes.segment(token)) {
      // Keycap digits and # are Emoji_Component, but a bare digit isn't an emoji.
      if (!EMOJI.test(segment) || /^[\d#*]$/.test(segment)) return null;
      emojis.push(segment);
    }
  }
  return emojis.length > 0 ? emojis : null;
}

/**
 * The time off a status stands for, or null when it isn't an away status (or cleared before
 * today). Away from today to the day it clears, in their time zone. With no end date, away for
 * this week only: the forecast's first, today and the 6 days after.
 */
export function statusTimeOff(
  status: LinearStatus,
  awayStatuses: readonly string[],
  today: CalendarDate,
): TimeOff | null {
  if (!isAwayStatus(status, awayStatuses)) return null;
  const what = [status.statusEmoji, status.statusLabel]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  const source = `Linear status ${what}`;
  if (!status.statusUntilAt) {
    return {
      id: STATUS_TIME_OFF_ID,
      startsOn: today,
      endsOn: addDays(today, 6),
      source: `${source}; status has no end date`,
    };
  }
  const endsOn = lastDay(status.statusUntilAt, status.timezone);
  if (endsOn === null || endsOn < today) return null;
  return { id: STATUS_TIME_OFF_ID, startsOn: today, endsOn, source };
}

/**
 * The last day a status that clears at `until` covers, in `timezone` (UTC when it's missing or
 * unknown). One cleared at midnight is over by that day, so it's the moment before that counts.
 * Null when `until` isn't a date-time.
 */
export function lastDay(until: string, timezone?: string | null): CalendarDate | null {
  const clears = Date.parse(until);
  if (Number.isNaN(clears)) return null;
  const last = new Date(clears - 1);
  return dateIn(last, timezone) ?? dateIn(last, "UTC");
}

function dateIn(instant: Date, timeZone?: string | null): CalendarDate | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const part = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    // Not a time zone Intl knows.
    return null;
  }
}
