// The forecast: each person's weather in the weeks ahead, as dated issues turn urgent. Pure, like
// the weather now that it projects forward.

import type { Matrix, MatrixIssue, Placed } from "./matrix";
import { addDays, type CalendarDate, type LinearPriority, type Quadrant } from "./quadrant";
import {
  DEFAULT_THRESHOLDS,
  type LoadMetric,
  teamWeather,
  type Weather,
  type WeatherKind,
  type WeatherThresholds,
} from "./weather";

/** The most weeks a forecast looks ahead. Past that, today's due dates say little. */
export const MAX_FORECAST_WEEKS = 12;

export interface ForecastWeek<I> {
  /** The week's first day: today for the first week, then every 7 days. */
  startsOn: CalendarDate;
  endsOn: CalendarDate;
  /** The urgent load expected by the week's end, against that week's team average. */
  weather: Weather;
  /** Issues the rules make urgent during the week (not those already urgent), most pressing first. */
  turningUrgent: Placed<I>[];
  /** What changes, e.g. "3 High-priority issues become urgent". */
  summary: string;
}

export interface TeamForecast<I> {
  /** Each person's weeks, in the order given. */
  people: ForecastWeek<I>[][];
  /** The team's weeks: how evenly the projected urgent load is spread. */
  team: ForecastWeek<I>[];
  /** The team's worst week: the most lopsided, else the first. */
  worst: ForecastWeek<I>;
}

/**
 * Everyone's weather for `weeks` weeks from today, and the team's.
 *
 * Each week projects every matrix to the week's last day, assuming:
 * - an issue turns urgent when its due date says (`becomesUrgentOn`);
 * - an issue placed by hand stays where it was put;
 * - work is done by its due date, so it leaves the load after it. Work already overdue has
 *   missed that, so it stays (and keeps the weather stormy) until it's done.
 *
 * Undated work never turns urgent, so someone holding it with nothing urgent projected is fog,
 * as it is now.
 */
export function forecast<I extends MatrixIssue>(
  people: readonly { name: string; matrix: Matrix<I> }[],
  metric: LoadMetric,
  today: CalendarDate,
  weeks: number,
  thresholds: WeatherThresholds = DEFAULT_THRESHOLDS,
): TeamForecast<I> {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_FORECAST_WEEKS) {
    throw new RangeError(`A forecast covers 1 to ${MAX_FORECAST_WEEKS} weeks, not ${weeks}`);
  }
  const byPerson: ForecastWeek<I>[][] = people.map(() => []);
  const team: ForecastWeek<I>[] = [];

  for (let week = 0; week < weeks; week++) {
    const startsOn = addDays(today, 7 * week);
    const endsOn = addDays(startsOn, 6);
    const projected = people.map(({ name, matrix }) => ({
      name,
      matrix: project(matrix, today, startsOn, endsOn),
    }));
    const weather = teamWeather(projected, metric, today, thresholds);
    const arrivals = people.map(({ matrix }) => turningUrgent(matrix, today, startsOn, endsOn));

    people.forEach((_, i) => {
      const theirs = arrivals[i] ?? [];
      byPerson[i]?.push({
        startsOn,
        endsOn,
        weather: weather.people[i] as Weather,
        turningUrgent: theirs,
        summary: describeArrivals(theirs),
      });
    });
    const all = arrivals.flat().sort(soonestFirst(today));
    team.push({
      startsOn,
      endsOn,
      weather: weather.team,
      turningUrgent: all,
      summary: describeArrivals(all),
    });
  }

  return { people: byPerson, team, worst: worstWeek(team) };
}

const URGENT: ReadonlySet<Quadrant> = new Set(["do", "delegate"]);

/** The first day an issue counts as urgent in the forecast, or null if it never will. */
function urgentFrom(issue: Placed<MatrixIssue>, today: CalendarDate): CalendarDate | null {
  if (issue.quadrantSource === "override") return URGENT.has(issue.quadrant) ? today : null;
  return issue.becomesUrgentOn;
}

/** A matrix as it should stand on `endsOn`, leaving out work due before `startsOn`. */
function project<I extends MatrixIssue>(
  matrix: Matrix<I>,
  today: CalendarDate,
  startsOn: CalendarDate,
  endsOn: CalendarDate,
): Matrix<I> {
  const projected: Matrix<I> = { do: [], schedule: [], delegate: [], drop: [] };
  for (const issue of Object.values(matrix).flat()) {
    const done = issue.dueDate !== null && issue.dueDate >= today && issue.dueDate < startsOn;
    if (done) continue;
    projected[projectedQuadrant(issue, today, endsOn)].push(issue);
  }
  return projected;
}

function projectedQuadrant(
  issue: Placed<MatrixIssue>,
  today: CalendarDate,
  on: CalendarDate,
): Quadrant {
  if (issue.quadrantSource === "override") return issue.quadrant;
  const from = urgentFrom(issue, today);
  const urgent = from !== null && from <= on;
  const important = issue.quadrant === "do" || issue.quadrant === "schedule";
  return important ? (urgent ? "do" : "schedule") : urgent ? "delegate" : "drop";
}

function turningUrgent<I extends MatrixIssue>(
  matrix: Matrix<I>,
  today: CalendarDate,
  startsOn: CalendarDate,
  endsOn: CalendarDate,
): Placed<I>[] {
  return [...matrix.schedule, ...matrix.drop]
    .filter((issue) => {
      const from = urgentFrom(issue, today);
      return from !== null && from > today && from >= startsOn && from <= endsOn;
    })
    .sort(soonestFirst(today));
}

/** By the day they turn urgent, then priority ("No priority" last). */
function soonestFirst(today: CalendarDate) {
  return (a: Placed<MatrixIssue>, b: Placed<MatrixIssue>) => {
    const [fromA, fromB] = [urgentFrom(a, today) ?? "", urgentFrom(b, today) ?? ""];
    if (fromA !== fromB) return fromA < fromB ? -1 : 1;
    return (a.priority || 5) - (b.priority || 5);
  };
}

const PRIORITY_LABEL: Record<LinearPriority, string> = {
  0: "unprioritized issue",
  1: "Urgent-priority issue",
  2: "High-priority issue",
  3: "Medium-priority issue",
  4: "Low-priority issue",
};

/** E.g. "3 High-priority issues and 1 Low-priority issue become urgent". */
function describeArrivals(issues: readonly MatrixIssue[]): string {
  if (issues.length === 0) return "Nothing new turns urgent";
  const byPriority = new Map<LinearPriority, number>();
  for (const { priority } of issues) byPriority.set(priority, (byPriority.get(priority) ?? 0) + 1);
  // Most important first, "No priority" last.
  const parts = [...byPriority]
    .sort(([a], [b]) => (a || 5) - (b || 5))
    .map(([priority, n]) => `${n} ${PRIORITY_LABEL[priority]}${n === 1 ? "" : "s"}`);
  const named =
    parts.length <= 2
      ? parts.join(" and ")
      : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `${named} ${issues.length === 1 ? "becomes" : "become"} urgent`;
}

/** Worst first. Fog is an unknown, so it ranks below any measured overload. */
const SEVERITY: Record<WeatherKind, number> = { storm: 4, rain: 3, fog: 2, cloudy: 1, sunny: 0 };

function worstWeek<I>(weeks: ForecastWeek<I>[]): ForecastWeek<I> {
  return weeks.reduce((worst, week) =>
    SEVERITY[week.weather.kind] > SEVERITY[worst.weather.kind] ? week : worst,
  );
}
