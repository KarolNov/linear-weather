// The demo's saved rules and overrides as a cookie value. Browsers keep about 4 KB a cookie, and
// JSON spends most of that on quotes (escaped to %22) and on the demo's long ids. So the cookie is
// plain text in characters a cookie carries unescaped, with the ids' fixed prefixes dropped:
//
//   1~avengers.2.7.0!ops.3.30.1~avg-1.3!ops-4.1
//   │ └ rules: team.importantFrom.urgencyWindowDays.noDueDate
//   │                             └ overrides: issue.quadrant
//   └ format version
//
// Enums are their index in QUADRANTS / NO_DUE_DATE. Everything read back is checked again,
// since the cookie comes from the client.

import {
  NO_DUE_DATE,
  parseRules,
  QUADRANTS,
  type Quadrant,
  type QuadrantRules,
} from "../domain/quadrant";

/** What the demo keeps for a visitor: whatever differs from the defaults. */
export interface DemoSaved {
  rules: Map<string, QuadrantRules>;
  overrides: Map<string, Quadrant>;
}

export const DEMO_COOKIE = "lw_demo";

export const DEMO_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "Lax",
  path: "/",
  // A year, or until the visitor clears the site's data.
  maxAge: 365 * 24 * 60 * 60,
} as const;

/** Browsers keep at most 4096 bytes a cookie, so anything longer was never ours. */
export const MAX_COOKIE_LENGTH = 4096;

const VERSION = "1";
const TEAM_PREFIX = "demo-team-";
const ISSUE_PREFIX = "demo-issue-";
/** An id without its prefix: nothing that could be mistaken for a separator. */
const SHORT_ID = /^[a-z0-9-]+$/;

export function encodeDemo({ rules, overrides }: DemoSaved): string {
  const teams = [...rules].flatMap(([teamId, { importantFrom, urgencyWindowDays, noDueDate }]) => {
    const id = shorten(teamId, TEAM_PREFIX);
    return id === null
      ? []
      : [`${id}.${importantFrom}.${urgencyWindowDays}.${NO_DUE_DATE.indexOf(noDueDate)}`];
  });
  const issues = [...overrides].flatMap(([issueId, quadrant]) => {
    const id = shorten(issueId, ISSUE_PREFIX);
    return id === null ? [] : [`${id}.${QUADRANTS.indexOf(quadrant)}`];
  });
  return [VERSION, teams.join("!"), issues.join("!")].join("~");
}

/**
 * What a visitor's cookie says, keeping only valid rules and quadrants. A cookie that isn't ours
 * at all, or from another version, reads as nothing saved.
 */
export function decodeDemo(value: string | undefined): DemoSaved {
  const saved: DemoSaved = { rules: new Map(), overrides: new Map() };
  if (!value || value.length > MAX_COOKIE_LENGTH) return saved;
  const [version, teams = "", issues = ""] = value.split("~");
  if (version !== VERSION) return saved;
  for (const [id, importantFrom, urgencyWindowDays, noDueDate] of fields(teams, 4)) {
    const undated = NO_DUE_DATE[index(noDueDate)];
    if (!undated || !SHORT_ID.test(id ?? "")) continue;
    const { rules } = parseRules({
      importantFrom: Number(importantFrom),
      urgencyWindowDays: Number(urgencyWindowDays),
      noDueDate: undated,
    });
    if (rules) saved.rules.set(TEAM_PREFIX + id, rules);
  }
  for (const [id, quadrant] of fields(issues, 2)) {
    const placed = QUADRANTS[index(quadrant)];
    if (placed && SHORT_ID.test(id ?? "")) saved.overrides.set(ISSUE_PREFIX + id, placed);
  }
  return saved;
}

/**
 * The id without its prefix, or null when it can't go in the cookie. Mutations only reach the
 * demo's own teams and issues, which all fit.
 */
function shorten(id: string, prefix: string): string | null {
  const short = id.startsWith(prefix) ? id.slice(prefix.length) : null;
  return short !== null && SHORT_ID.test(short) ? short : null;
}

/** A list's entries, each split into its fields; entries with more or fewer are dropped. */
function fields(list: string, count: number): string[][] {
  const entries = list ? list.split("!").map((entry) => entry.split(".")) : [];
  return entries.filter((entry) => entry.length === count);
}

/** An enum's index, or -1 when it isn't a whole number. */
function index(digits: string | undefined): number {
  return digits && /^\d$/.test(digits) ? Number(digits) : -1;
}
