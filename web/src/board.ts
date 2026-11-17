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
 * How heavy someone's urgent load is now, against the team's average, or AWAY when they're off.
 * For a team, how evenly it's spread: as bad as its worst person, a storm when someone away holds
 * urgent work, cloudy when some have room while others carry it. Never AWAY.
 */
export type WeatherKind = "SUNNY" | "CLOUDY" | "RAIN" | "STORM" | "FOG" | "AWAY";

/** A stretch of days someone is away, first and last day included. */
export interface TimeOff {
  id: string;
  startsOn: CalendarDate;
  endsOn: CalendarDate;
}

export interface Weather {
  kind: WeatherKind;
  /** Why, e.g. "13 urgent points, 3.1× the team average" or "Tony Stark is in a storm". */
  reason: string;
}

/** A person's weather, with what keeps them in a storm whatever is handed over. */
export interface PersonWeather extends Weather {
  /** Their overdue urgent (Do or Delegate) issues, as the server counts them. */
  overdue: number;
}

/** One week ahead: the weather expected by its end, and what turns urgent during it. */
export interface ForecastWeek {
  /** Today for the first week, then every 7 days. */
  startsOn: CalendarDate;
  /** The day its weather is for. */
  endsOn: CalendarDate;
  weather: Weather;
  /** E.g. "3 High-priority issues become urgent". */
  summary: string;
  turningUrgent: { identifier: string }[];
}

/** Hand one issue from one person to another, to even out urgent load. */
export interface Suggestion {
  issue: Pick<BoardIssue, "id" | "identifier" | "title" | "url"> & {
    quadrant: "DO" | "SCHEDULE" | "DELEGATE" | "DROP";
    /** When it turns urgent: today for work urgent now. */
    becomesUrgentOn: CalendarDate | null;
  };
  from: Person;
  to: Person;
  /** For the forecast, the week (from 1) the move heads a storm off in. Null for now. */
  week: number | null;
  /** The taker's weather after the move, now or in that week. */
  toWeather: WeatherKind;
  /** E.g. "Ana goes from 2.1× to 1.4× the team average, Ben from 0.5× to 1.1×". */
  reason: string;
}

/** Moves for today's storms, and for the ones the forecast sees coming. */
export interface Rebalance {
  rebalanceNow: Suggestion[];
  rebalanceForecast: Suggestion[];
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
  /** Flag backlog rot when more than this percent of open issues are in Drop: 1 to 99. */
  dropAlertPercent: number;
}

/** Whether too much of the team's open work sits in Drop, against its alert. */
export interface BacklogRot {
  rotting: boolean;
  /** E.g. "12 of 20 open issues (60%) are in Drop, over the team's 40% alert". */
  reason: string;
}

/** The longest urgency window the server accepts (`MAX_URGENCY_WINDOW_DAYS`). */
export const MAX_URGENCY_WINDOW_DAYS = 365;

/** The most stretches of time off coming up the server keeps for one person (`MAX_TIME_OFF`). */
export const MAX_TIME_OFF = 8;

export interface PersonMatrix {
  /** Null for the team's unassigned issues. */
  assignee: Person | null;
  /**
   * How much of a full-time week they work, more than 0 up to 1. Their weather compares their
   * load with the team average times this. Null for the unassigned issues.
   */
  capacity: number | null;
  /** Time off not over yet, soonest first. Null for the unassigned issues. */
  timeOff: TimeOff[] | null;
  matrix: Matrix;
  /** Null for the unassigned issues: nobody's load. */
  weather: PersonWeather | null;
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
  team: (Team & Rebalance & { rules: Rules; weather: Weather; backlogRot: BacklogRot }) | null;
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
  rules { importantFrom urgencyWindowDays noDueDate dropAlertPercent }
  weather { kind reason }
  backlogRot { rotting reason }
  rebalanceNow: rebalanceSuggestions(horizon: NOW) { ...Suggestion }
  rebalanceForecast: rebalanceSuggestions(horizon: FORECAST) { ...Suggestion }
  people {
    id
    name
    avatarUrl
    capacity
    timeOff { id startsOn endsOn }
    weather { kind reason overdue }
    forecast { startsOn endsOn weather { kind reason } summary turningUrgent { identifier } }
    matrix { ${MATRIX_FIELDS} }
  }
  unassigned { ${MATRIX_FIELDS} }
}

fragment Suggestion on Suggestion {
  issue { id identifier title url quadrant becomesUrgentOn }
  from { id name avatarUrl }
  to { id name avatarUrl }
  week
  toWeather
  reason
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
export type TeamBoardData = Team &
  Rebalance & {
    rules: Rules;
    weather: Weather;
    backlogRot: BacklogRot;
    people: (Person & {
      capacity: number;
      timeOff: TimeOff[];
      matrix: Matrix;
      weather: PersonWeather;
      forecast: ForecastWeek[];
    })[];
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
  const matrices: PersonMatrix[] = people.map(
    ({ matrix, weather, forecast, capacity, timeOff, ...assignee }) => ({
      assignee,
      capacity,
      timeOff,
      matrix,
      weather,
      forecast,
    }),
  );
  if (total(unassigned) > 0) {
    matrices.push({
      assignee: null,
      capacity: null,
      timeOff: null,
      matrix: unassigned,
      weather: null,
      forecast: null,
    });
  }
  return { team, people: matrices };
}

/** Someone with overdue urgent work, which keeps them in a storm whatever is handed over. */
export interface RunningLate {
  person: Person;
  /** Their overdue urgent issues. */
  overdue: number;
}

/**
 * Who has overdue urgent (Do or Delegate) issues, by their weather. Overdue work always means a
 * storm, and rebalancing doesn't move it, so these storms outlast any moves. Someone away is left
 * out: rebalancing hands on everything urgent they hold, overdue or not.
 */
export function runningLate(people: PersonMatrix[]): RunningLate[] {
  return people.flatMap(({ assignee, weather }) =>
    assignee && weather && weather.kind !== "AWAY" && weather.overdue > 0
      ? [{ person: assignee, overdue: weather.overdue }]
      : [],
  );
}

/** The capacities the board offers, full time first. Any other the server holds is offered too. */
export const CAPACITIES = [1, 0.8, 0.6, 0.5, 0.4, 0.2];

/** A capacity as the board names it, e.g. "Full time", "Half time" or "80% time". */
export function describeCapacity(factor: number): string {
  if (factor === 1) return "Full time";
  if (factor === 0.5) return "Half time";
  return `${Math.round(factor * 100)}% time`;
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

/**
 * A forecast week as the strip labels it: by the day its weather is for, e.g. "By Oct 24", so it
 * doesn't read as the weather now.
 */
export function describeWeek(endsOn: CalendarDate): string {
  return `By ${describeDay(endsOn)}`;
}

/** Time off as the board names it, e.g. "Nov 16 – Nov 20", or "Nov 16" for one day. */
export function describeTimeOff({
  startsOn,
  endsOn,
}: Pick<TimeOff, "startsOn" | "endsOn">): string {
  return startsOn === endsOn
    ? describeDay(startsOn)
    : `${describeDay(startsOn)} – ${describeDay(endsOn)}`;
}

/** A date as the board shows it in passing, e.g. "Oct 24". UTC, like `describeDue`. */
export function describeDay(date: CalendarDate): string {
  return shortDate.format(Date.parse(date));
}

const conjunction = new Intl.ListFormat("en-US", { type: "conjunction" });

/** Items as a sentence lists them, e.g. "AVG-1 to Ana, AVG-2 to Ben, and AVG-3 to Cy". */
export function listOf(items: string[]): string {
  return conjunction.format(items);
}
