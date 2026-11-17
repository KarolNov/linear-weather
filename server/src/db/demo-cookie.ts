// The demo's saved rules and overrides as a cookie value. Browsers keep about 4 KB a cookie, and
// JSON spends most of that on quotes (escaped to %22) and on the demo's long ids. So the cookie is
// plain text in characters a cookie carries unescaped, with the ids' fixed prefixes dropped:
//
//   1~avengers.2.7.0!ops.3.30.1.25~avg-1.3!ops-4.1~avg-10.wanda~tony.50~tony.20261116.4
//   │ └ rules: team.importantFrom.urgencyWindowDays.noDueDate[.dropAlertPercent]
//   │          (the alert left off at its default, as cookies from before it have it)
//   │                                └ overrides: issue.quadrant
//   │                                            └ assignees: issue.user
//   │                                                         └ capacities: user.percent
//   │                                                                  └ time off: user.firstDay.
//   │                                                                    days after it to the last
//   └ format version
//
// Trailing sections are left off when empty, as cookies from before them have them. Time off
// that's over is dropped as the cookie is read, so it can't pile up.
//
// Enums are their index in QUADRANTS / NO_DUE_DATE. Everything read back is checked again,
// since the cookie comes from the client.

import { FULL_TIME, parseCapacity } from "../domain/capacity";
import {
  addDays,
  type CalendarDate,
  DEFAULT_RULES,
  NO_DUE_DATE,
  parseRules,
  QUADRANTS,
  type Quadrant,
  type QuadrantRules,
} from "../domain/quadrant";
import {
  daysBetween,
  MAX_TIME_OFF,
  rangeProblem,
  type TimeOff,
  upcoming,
} from "../domain/time-off";
import { DEMO_OPS_TEAM, DEMO_TEAM, demoIssue } from "../linear/demo";

/**
 * What the demo keeps for a visitor: the rules and quadrants they set, who has which issue, and
 * who works part time.
 */
export interface DemoSaved {
  rules: Map<string, QuadrantRules>;
  overrides: Map<string, Quadrant>;
  /** User ids by issue id, for issues handed to someone the demo doesn't give them to. */
  assignees: Map<string, string>;
  /** Capacities by user id, for anyone not full time. */
  capacities: Map<string, number>;
  /** Time off by user id, for anyone with some not over yet. */
  timeOff: Map<string, TimeOff[]>;
}

export const DEMO_COOKIE = "lw_demo";

/** A year, or until the visitor clears the site's data. */
export const DEMO_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** Browsers keep at most 4096 bytes a cookie, so anything longer was never ours. */
export const MAX_COOKIE_LENGTH = 4096;

const VERSION = "1";
const TEAM_PREFIX = "demo-team-";
const ISSUE_PREFIX = "demo-issue-";
const USER_PREFIX = "demo-user-";
/** An id without its prefix: nothing that could be mistaken for a separator. */
const SHORT_ID = /^[a-z0-9-]+$/;
/**
 * The demo's own teams and people (`demoIssue` knows its issues). Nothing else is read back, so a
 * cookie can't carry more than the whole demo.
 */
const TEAM_IDS = new Set([DEMO_TEAM.id, DEMO_OPS_TEAM.id]);
const USER_IDS = new Set(
  [DEMO_TEAM, DEMO_OPS_TEAM].flatMap((team) => team.members.map(({ id }) => id)),
);

/** The demo's id for a stretch of time off: what it covers, so the cookie needn't keep one. */
export function demoTimeOffId(userId: string, startsOn: CalendarDate, endsOn: CalendarDate) {
  return `demo-time-off-${shorten(userId, USER_PREFIX)}-${compact(startsOn)}-${daysBetween(startsOn, endsOn)}`;
}

export function encodeDemo({
  rules,
  overrides,
  assignees,
  capacities,
  timeOff,
}: DemoSaved): string {
  const teams = [...rules].map(
    ([teamId, { importantFrom, urgencyWindowDays, noDueDate, dropAlertPercent }]) =>
      `${shorten(teamId, TEAM_PREFIX)}.${importantFrom}.${urgencyWindowDays}.${NO_DUE_DATE.indexOf(noDueDate)}${
        dropAlertPercent === DEFAULT_RULES.dropAlertPercent ? "" : `.${dropAlertPercent}`
      }`,
  );
  const issues = [...overrides].map(
    ([issueId, quadrant]) => `${shorten(issueId, ISSUE_PREFIX)}.${QUADRANTS.indexOf(quadrant)}`,
  );
  const handed = [...assignees].map(
    ([issueId, userId]) => `${shorten(issueId, ISSUE_PREFIX)}.${shorten(userId, USER_PREFIX)}`,
  );
  // Hundredths, as parseCapacity keeps them, so a whole percent.
  const parts = [...capacities].map(
    ([userId, factor]) => `${shorten(userId, USER_PREFIX)}.${Math.round(factor * 100)}`,
  );
  const away = [...timeOff].flatMap(([userId, stretches]) =>
    stretches.map(
      ({ startsOn, endsOn }) =>
        `${shorten(userId, USER_PREFIX)}.${compact(startsOn)}.${daysBetween(startsOn, endsOn)}`,
    ),
  );
  const sections = [
    VERSION,
    teams.join("!"),
    issues.join("!"),
    handed.join("!"),
    parts.join("!"),
    away.join("!"),
  ];
  while (sections.length > 3 && sections.at(-1) === "") sections.pop();
  return sections.join("~");
}

/**
 * What a visitor's cookie says, keeping only valid rules and quadrants for the demo's own teams
 * and issues, and time off not over by `today`. A cookie that isn't ours
 * at all, or from another version, reads as nothing saved.
 */
export function decodeDemo(
  value: string | undefined,
  today: CalendarDate = "0000-01-01",
): DemoSaved {
  const saved: DemoSaved = {
    rules: new Map(),
    overrides: new Map(),
    assignees: new Map(),
    capacities: new Map(),
    timeOff: new Map(),
  };
  if (!value || value.length > MAX_COOKIE_LENGTH) return saved;
  const [version, teams = "", issues = "", assignees = "", capacities = "", away = ""] =
    value.split("~");
  if (version !== VERSION) return saved;
  for (const [id, importantFrom, urgencyWindowDays, noDueDate, dropAlertPercent] of fields(
    teams,
    4,
    5,
  )) {
    const undated = NO_DUE_DATE[index(noDueDate)];
    if (!undated || !TEAM_IDS.has(TEAM_PREFIX + id)) continue;
    const { rules } = parseRules({
      importantFrom: Number(importantFrom),
      urgencyWindowDays: Number(urgencyWindowDays),
      noDueDate: undated,
      dropAlertPercent:
        dropAlertPercent === undefined
          ? DEFAULT_RULES.dropAlertPercent
          : wholeNumber(dropAlertPercent),
    });
    if (rules) saved.rules.set(TEAM_PREFIX + id, rules);
  }
  for (const [id, quadrant] of fields(issues, 2)) {
    const placed = QUADRANTS[index(quadrant)];
    if (placed && demoIssue(ISSUE_PREFIX + id)) saved.overrides.set(ISSUE_PREFIX + id, placed);
  }
  for (const [id, user] of fields(assignees, 2)) {
    if (demoIssue(ISSUE_PREFIX + id) && USER_IDS.has(USER_PREFIX + user)) {
      saved.assignees.set(ISSUE_PREFIX + id, USER_PREFIX + user);
    }
  }
  for (const [user, percent] of fields(capacities, 2)) {
    const parsed = parseCapacity(wholeNumber(percent ?? "") / 100);
    // Full time is nothing to keep, as setCapacity has it.
    if (USER_IDS.has(USER_PREFIX + user) && "factor" in parsed && parsed.factor !== FULL_TIME) {
      saved.capacities.set(USER_PREFIX + user, parsed.factor);
    }
  }
  for (const [user, first, days] of fields(away, 3)) {
    const userId = USER_PREFIX + user;
    const startsOn = expand(first ?? "");
    const length = wholeNumber(days ?? "");
    if (!USER_IDS.has(userId) || startsOn === null || !Number.isInteger(length)) continue;
    // A real day first, so working out the last one can't throw.
    if (rangeProblem(startsOn, startsOn)) continue;
    const endsOn = addDays(startsOn, length);
    if (rangeProblem(startsOn, endsOn) || endsOn < today) continue;
    const theirs = saved.timeOff.get(userId) ?? [];
    // No more than the board lets anyone add.
    if (theirs.length >= MAX_TIME_OFF) continue;
    const id = demoTimeOffId(userId, startsOn, endsOn);
    if (theirs.some((stretch) => stretch.id === id)) continue;
    saved.timeOff.set(userId, upcoming([...theirs, { id, startsOn, endsOn }], today));
  }
  return saved;
}

/** 2026-11-16 as 20261116. */
function compact(date: CalendarDate): string {
  return date.replaceAll("-", "");
}

/** 20261116 as 2026-11-16, or null if it isn't eight digits. */
function expand(digits: string): CalendarDate | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(digits);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/**
 * The id without its prefix. Mutations only reach the demo's own teams and issues, which all fit,
 * so one that doesn't throws rather than answer success and quietly not save it.
 */
function shorten(id: string, prefix: string): string {
  const short = id.startsWith(prefix) ? id.slice(prefix.length) : "";
  if (!SHORT_ID.test(short)) throw new Error(`The demo cookie can't hold the id ${id}`);
  return short;
}

/** A list's entries, each split into its fields; entries with more or fewer are dropped. */
function fields(list: string, min: number, max = min): string[][] {
  const entries = list ? list.split("!").map((entry) => entry.split(".")) : [];
  return entries.filter((entry) => entry.length >= min && entry.length <= max);
}

/** Digits as a number; anything else as NaN, which parseRules turns away. */
function wholeNumber(digits: string): number {
  return /^\d+$/.test(digits) ? Number(digits) : Number.NaN;
}

/** An enum's index, or -1 when it isn't a whole number. */
function index(digits: string | undefined): number {
  return digits && /^\d$/.test(digits) ? Number(digits) : -1;
}
