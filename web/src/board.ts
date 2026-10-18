import type { Viewer } from "./App";

// The board as the server's `GET /board` sends it (server/src/board.ts). Temporary, like that
// route: the web app will query our GraphQL schema instead once it has the board (#8).

export type Quadrant = "do" | "schedule" | "delegate" | "drop";

export const QUADRANTS: Quadrant[] = ["do", "schedule", "delegate", "drop"];

/** A calendar date, `YYYY-MM-DD`. */
export type CalendarDate = string;

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
  state: { name: string; type: string };
  quadrant: Quadrant;
  /** Why it's in its quadrant, e.g. "High priority, due in 3 days". */
  reason: string;
}

export interface PersonMatrix {
  /** Null for the team's unassigned issues. */
  assignee: Person | null;
  counts: Record<Quadrant, number>;
  issues: BoardIssue[];
}

export interface Board {
  today: CalendarDate;
  teams: Team[];
  team: Team | null;
  people: PersonMatrix[];
}

/** Why the board couldn't load: Linear's rate limit (with when it resets), or anything else. */
export type BoardError = { kind: "rate_limited"; resetAt: number | null } | { kind: "unavailable" };

/** `GET /board` when signed in: who it is, and their board or why it couldn't load. */
export type BoardResponse = { viewer: Viewer } & ({ board: Board } | { boardError: BoardError });

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
