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
 * words appear in the status's label as whole words ("off" doesn't match "Office hours"), or when
 * the status's emoji is among the entry's: "🌴", "🌴🏖️✈️" and "🌴 🤒" all match 🌴. Linear
 * shortcodes like ":palm_tree:" count as emojis too, and match the emoji they stand for when it's
 * a common status one. Variation selectors are ignored: 🏖 matches 🏖️.
 */
export function isAwayStatus(status: LinearStatus, awayStatuses: readonly string[]): boolean {
  const emoji = canonicalEmoji(status.statusEmoji?.trim() ?? "");
  const label = status.statusLabel?.toLowerCase() ?? "";
  return awayStatuses.some((entry) => {
    const wanted = entry.trim().toLowerCase();
    if (wanted === "") return false;
    if (label !== "" && wholeWords(wanted).test(label)) return true;
    if (emoji === "") return false;
    if (canonicalEmoji(wanted) === emoji) return true;
    return emojisIn(wanted)?.some((listed) => canonicalEmoji(listed) === emoji) ?? false;
  });
}

/** Matches `text` where it isn't part of a longer word. */
function wholeWords(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u");
}

/**
 * Linear's shortcodes for emojis people set as an away status, e.g. ":palm_tree:" for 🌴. Not every
 * shortcode: one that isn't here still matches the same shortcode in an entry.
 */
const SHORTCODES: Record<string, string> = {
  ":palm_tree:": "🌴",
  ":beach_with_umbrella:": "🏖",
  ":beach_umbrella:": "🏖",
  ":desert_island:": "🏝",
  ":island:": "🏝",
  ":airplane:": "✈",
  ":airplane_departure:": "🛫",
  ":luggage:": "🧳",
  ":face_with_thermometer:": "🤒",
  ":thermometer_face:": "🤒",
  ":mask:": "😷",
  ":sneezing_face:": "🤧",
  ":nauseated_face:": "🤢",
  ":hospital:": "🏥",
  ":pill:": "💊",
  ":house:": "🏠",
  ":house_with_garden:": "🏡",
  ":baby:": "👶",
  ":baby_bottle:": "🍼",
  ":sleeping:": "😴",
  ":zzz:": "💤",
  ":sunny:": "☀",
  ":sun_with_face:": "🌞",
  ":calendar:": "📆",
  ":date:": "📅",
  ":spiral_calendar_pad:": "🗓",
  ":spiral_calendar:": "🗓",
  ":tent:": "⛺",
  ":camping:": "🏕",
  ":skier:": "⛷",
  ":snowman:": "☃",
  ":christmas_tree:": "🎄",
  ":mountain_snow:": "🏔",
  ":snow_capped_mountain:": "🏔",
  ":car:": "🚗",
  ":red_car:": "🚗",
  ":train:": "🚆",
  ":headphones:": "🎧",
  ":no_entry:": "⛔",
  ":no_entry_sign:": "🚫",
};

/** An emoji as compared: a known shortcode as its emoji, variation selectors dropped, lower case. */
function canonicalEmoji(emoji: string): string {
  const lower = emoji.toLowerCase();
  return (SHORTCODES[lower] ?? lower).replace(/[︎️]/g, "");
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
  const emoji = status.statusEmoji?.trim();
  const what = [emoji && (SHORTCODES[emoji.toLowerCase()] ?? emoji), status.statusLabel]
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

/** A date formatter for each time zone asked for, null for one Intl doesn't know. */
const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterIn(timeZone: string): Intl.DateTimeFormat | null {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      // Not a time zone Intl knows.
      formatter = null;
    }
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function dateIn(instant: Date, timeZone?: string | null): CalendarDate | null {
  const parts = formatterIn(timeZone || "UTC")?.formatToParts(instant);
  if (!parts) return null;
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
