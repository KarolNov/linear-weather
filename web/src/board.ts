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
  /** Placed by the team's rules, or by hand (and then it stays put whatever the rules say). */
  quadrantSource: "RULE" | "OVERRIDE";
  /**
   * Why it's in its quadrant, e.g. "High priority, due in 3 days". Placed by hand, it says where
   * the rules would put it.
   */
  placementReason: string;
}

/**
 * How heavy someone's urgent load is now, against the team's average. For a team, how evenly
 * it's spread: as bad as its worst person, cloudy when some have room while others carry it.
 */
export type WeatherKind = "SUNNY" | "CLOUDY" | "RAIN" | "STORM" | "FOG";

export interface Weather {
  kind: WeatherKind;
  /** Why, e.g. "13 urgent points, 3.1× the team average" or "Tony Stark is in a storm". */
  reason: string;
}

/** One week ahead: the weather expected by its end, and what turns urgent during it. */
export interface ForecastWeek {
  /** Today for the first week, then every 7 days. */
  startsOn: CalendarDate;
  weather: Weather;
  /** E.g. "3 High-priority issues become urgent". */
  summary: string;
  turningUrgent: { identifier: string }[];
}

/** Issues by quadrant, each most pressing first. */
export type Matrix = Record<Quadrant, BoardIssue[]> & { counts: Record<Quadrant, number> };

/** How a team sorts issues into quadrants. */
export interface Rules {
  /** Lowest Linear priority that still counts as important: 1 Urgent … 4 Low. */
  importantFrom: number;
  /** Urgent when due in fewer than this many days, or overdue. */
  urgencyWindowDays: number;
  noDueDate: "URGENT" | "NOT_URGENT";
}

/** The longest urgency window the server accepts (`MAX_URGENCY_WINDOW_DAYS`). */
export const MAX_URGENCY_WINDOW_DAYS = 365;

export interface PersonMatrix {
  /** Null for the team's unassigned issues. */
  assignee: Person | null;
  matrix: Matrix;
  /** Null for the unassigned issues: nobody's load. */
  weather: Weather | null;
  /** The weeks ahead, this one first. Null for the unassigned issues. */
  forecast: ForecastWeek[] | null;
}

export interface Board {
  today: CalendarDate;
  teams: Team[];
  /**
   * The team asked for, else the viewer's default, with its rules and weather. Null when there
   * are no teams.
   */
  team: (Team & { rules: Rules; weather: Weather }) | null;
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

/**
 * One team's part of the board. The page loads it, and every mutation asks for it back, so the
 * board can redraw from the answer.
 */
export const TEAM_BOARD_FRAGMENTS = `fragment TeamBoard on Team {
  id
  name
  key
  rules { importantFrom urgencyWindowDays noDueDate }
  weather { kind reason }
  people {
    id
    name
    avatarUrl
    weather { kind reason }
    forecast { startsOn weather { kind reason } summary turningUrgent { identifier } }
    matrix { ${MATRIX_FIELDS} }
  }
  unassigned { ${MATRIX_FIELDS} }
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
  quadrantSource
  placementReason
}`;

/** Who is signed in and their board, in one request. `$teamId` falls back to their team. */
export const BOARD_QUERY = `query Board($teamId: ID) {
  today
  viewer { name avatarUrl organization { name } }
  teams { id name key }
  team(id: $teamId) { ...TeamBoard }
}

${TEAM_BOARD_FRAGMENTS}`;

/** A team as the TeamBoard fragment has it. */
export type TeamBoardData = Team & {
  rules: Rules;
  weather: Weather;
  people: (Person & { matrix: Matrix; weather: Weather; forecast: ForecastWeek[] })[];
  unassigned: Matrix;
};

/** BOARD_QUERY's `data`. */
export interface BoardData {
  today: CalendarDate;
  viewer: Viewer | null;
  teams: Team[] | null;
  team: TeamBoardData | null;
}

/** The board's team and people from the TeamBoard fragment. Unassigned issues come last, if any. */
export function teamBoard({
  people,
  unassigned,
  ...team
}: TeamBoardData): Pick<Board, "team" | "people"> {
  const matrices: PersonMatrix[] = people.map(({ matrix, weather, forecast, ...assignee }) => ({
    assignee,
    matrix,
    weather,
    forecast,
  }));
  if (total(unassigned) > 0) {
    matrices.push({ assignee: null, matrix: unassigned, weather: null, forecast: null });
  }
  return { team, people: matrices };
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

/** A forecast week as the strip labels it: "This week", then the date it starts, e.g. "Oct 25". */
export function describeWeek(startsOn: CalendarDate, today: CalendarDate): string {
  return startsOn === today ? "This week" : shortDate.format(Date.parse(startsOn));
}
