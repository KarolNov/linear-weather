// The board as our GraphQL server answers BOARD_QUERY (server/src/schema.ts).

export type Quadrant = "do" | "schedule" | "delegate" | "drop";

export const QUADRANTS: Quadrant[] = ["do", "schedule", "delegate", "drop"];

/** A calendar date, `YYYY-MM-DD`. */
export type CalendarDate = string;

export interface Viewer {
  name: string;
  avatarUrl: string | null;
  organization: { name: string };
}

export interface Team {
  id: string;
  name: string;
  key: string;
}

export interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface BoardIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  dueDate: CalendarDate | null;
  /** Linear's: 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low. */
  priority: number;
  estimate: number | null;
  state: { name: string };
  /** Why it's in its quadrant, e.g. "High priority, due in 3 days". */
  placementReason: string;
}

/** Issues by quadrant, each most pressing first. */
export type Matrix = Record<Quadrant, BoardIssue[]> & { counts: Record<Quadrant, number> };

export interface PersonMatrix {
  /** Null for the team's unassigned issues. */
  assignee: Person | null;
  matrix: Matrix;
}

export interface Board {
  today: CalendarDate;
  teams: Team[];
  /** The team asked for, else the viewer's default. Null when there are no teams. */
  team: Team | null;
  /** The team's people, then its unassigned issues if it has any. */
  people: PersonMatrix[];
}

/** Why the board couldn't load: Linear's rate limit (with when it resets), or anything else. */
export type BoardError = { kind: "rate_limited"; resetAt: number | null } | { kind: "unavailable" };

const MATRIX_FIELDS = `
  counts { do schedule delegate drop }
  do { ...BoardIssue }
  schedule { ...BoardIssue }
  delegate { ...BoardIssue }
  drop { ...BoardIssue }
`;

/** Who is signed in and their board, in one request. `$teamId` falls back to their team. */
export const BOARD_QUERY = `query Board($teamId: ID) {
  today
  viewer { name avatarUrl organization { name } }
  teams { id name key }
  team(id: $teamId) {
    id
    name
    key
    people { id name avatarUrl matrix { ${MATRIX_FIELDS} } }
    unassigned { ${MATRIX_FIELDS} }
  }
}

fragment BoardIssue on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  state { name }
  placementReason
}`;

/** BOARD_QUERY's `data`. */
export interface BoardData {
  today: CalendarDate;
  viewer: Viewer | null;
  teams: Team[] | null;
  team: (Team & { people: (Person & { matrix: Matrix })[]; unassigned: Matrix }) | null;
}

/** The number of issues in a matrix. */
export const total = (matrix: Matrix) => QUADRANTS.reduce((n, q) => n + matrix.counts[q], 0);

const MS_PER_DAY = 86_400_000;

const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const longDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * A due date as the card shows it, e.g. "Oct 20 · in 2 days" or "Oct 13 · 5 days late".
 * Formatted in UTC so the server and the browser render the same text.
 */
export function describeDue(dueDate: CalendarDate, today: CalendarDate) {
  const due = Date.parse(dueDate);
  const days = Math.round((due - Date.parse(today)) / MS_PER_DAY);
  const sameYear = dueDate.slice(0, 4) === today.slice(0, 4);
  const date = (sameYear ? shortDate : longDate).format(due);
  const relative =
    days === 0
      ? "today"
      : days === 1
        ? "tomorrow"
        : days > 0
          ? `in ${days} days`
          : `${-days} ${days === -1 ? "day" : "days"} late`;
  return { text: `${date} · ${relative}`, overdue: days < 0, today: days === 0 };
}
