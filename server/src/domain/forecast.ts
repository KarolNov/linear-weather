// The forecast: each person's weather in the weeks ahead, as dated issues turn urgent. Pure, like
// the weather now that it projects forward.

import { byPriority, isImportant, type Matrix, type MatrixIssue, type Placed } from "./matrix";
import { addDays, type CalendarDate, type LinearPriority, type Quadrant } from "./quadrant";
import {
  DEFAULT_THRESHOLDS,
  type LoadMetric,
  list,
  loadMetricFor,
  type Staffed,
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
  /** The urgent load expected by the week's end, against that week's fair share. */
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

/** Whether a forecast can look `weeks` weeks ahead: a whole number, 1 to MAX_FORECAST_WEEKS. */
export function isForecastHorizon(weeks: number): boolean {
  return Number.isInteger(weeks) && weeks >= 1 && weeks <= MAX_FORECAST_WEEKS;
}

/**
 * Everyone's weather for `weeks` weeks from today, and the team's.
 *
 * Each week projects every matrix to the week's last day, assuming:
 * - an issue turns urgent when its due date says (`becomesUrgentOn`);
 * - an issue placed by hand stays where it was put;
 * - work is done by its due date, so it leaves the load once that's passed. Work already
 *   overdue has missed that, so it stays (and keeps the weather stormy) until it's done.
 *
 * Undated work never turns urgent, so someone holding it with nothing urgent projected is fog,
 * as it is now. Each week compares people with their fair share of that week's load, as the
 * weather now does.
 *
 * Without a `metric`, load is counted in points only if every issue urgent in any projected
 * week is estimated, so work arriving later can't turn a week to fog for want of an estimate.
 */
export function forecast<I extends MatrixIssue>(
  people: readonly Staffed<I>[],
  metric: LoadMetric | null,
  today: CalendarDate,
  weeks: number,
  thresholds: WeatherThresholds = DEFAULT_THRESHOLDS,
): TeamForecast<I> {
  if (!isForecastHorizon(weeks)) {
    throw new RangeError(`A forecast covers 1 to ${MAX_FORECAST_WEEKS} weeks, not ${weeks}`);
  }
  // `becomesUrgentOn` is worked out on each read, so read it once per issue.
  const firstUrgent = new Map<Placed<MatrixIssue>, CalendarDate | null>();
  for (const { matrix } of people) {
    for (const issue of Object.values(matrix).flat()) {
      firstUrgent.set(issue, urgentFrom(issue, today));
    }
  }
  const from = (issue: Placed<MatrixIssue>) => firstUrgent.get(issue) ?? null;

  const spans = Array.from({ length: weeks }, (_, week) => {
    const startsOn = addDays(today, 7 * week);
    return { startsOn, endsOn: addDays(startsOn, 6) };
  });
  const projections = spans.map(({ endsOn }) =>
    people.map(({ name, matrix, capacity }) => ({
      name,
      capacity,
      matrix: project(matrix, from, today, endsOn),
    })),
  );
  const counted =
    metric ?? loadMetricFor(projections.flatMap((projected) => projected.map((p) => p.matrix)));

  const byPerson: ForecastWeek<I>[][] = people.map(() => []);
  const team: ForecastWeek<I>[] = spans.map(({ startsOn, endsOn }, week) => {
    const weather = teamWeather(projections[week] ?? [], counted, today, thresholds);
    const arrivals = people.map(({ matrix }) => turningUrgent(matrix, from, startsOn, endsOn));
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
    const all = arrivals.flat().sort(soonestFirst(from));
    return {
      startsOn,
      endsOn,
      weather: weather.team,
      turningUrgent: all,
      summary: describeArrivals(all),
    };
  });

  return { people: byPerson, team, worst: worstWeek(team) };
}

const URGENT: ReadonlySet<Quadrant> = new Set(["do", "delegate"]);

/** The first day an issue counts as urgent in the forecast, or null if it never will. */
export function urgentFrom(issue: Placed<MatrixIssue>, today: CalendarDate): CalendarDate | null {
  if (issue.quadrantSource === "override") return URGENT.has(issue.quadrant) ? today : null;
  return issue.becomesUrgentOn;
}

export type UrgentFrom = (issue: Placed<MatrixIssue>) => CalendarDate | null;

/** A matrix as it should stand on `on`: work due before then is done, unless already overdue. */
export function project<I extends MatrixIssue>(
  matrix: Matrix<I>,
  from: UrgentFrom,
  today: CalendarDate,
  on: CalendarDate,
): Matrix<I> {
  const projected: Matrix<I> = { do: [], schedule: [], delegate: [], drop: [] };
  for (const issue of Object.values(matrix).flat()) {
    const done = issue.dueDate !== null && issue.dueDate >= today && issue.dueDate < on;
    if (done) continue;
    projected[projectedQuadrant(issue, from, on)].push(issue);
  }
  return projected;
}

function projectedQuadrant(
  issue: Placed<MatrixIssue>,
  from: UrgentFrom,
  on: CalendarDate,
): Quadrant {
  if (issue.quadrantSource === "override") return issue.quadrant;
  const urgentOn = from(issue);
  const urgent = urgentOn !== null && urgentOn <= on;
  return isImportant(issue) ? (urgent ? "do" : "schedule") : urgent ? "delegate" : "drop";
}

/** Issues the rules make urgent from `startsOn` to `endsOn`, not those urgent already. */
function turningUrgent<I extends MatrixIssue>(
  matrix: Matrix<I>,
  from: UrgentFrom,
  startsOn: CalendarDate,
  endsOn: CalendarDate,
): Placed<I>[] {
  // Schedule and Drop hold only what isn't urgent today.
  return [...matrix.schedule, ...matrix.drop]
    .filter((issue) => {
      const urgentOn = from(issue);
      return urgentOn !== null && urgentOn >= startsOn && urgentOn <= endsOn;
    })
    .sort(soonestFirst(from));
}

/** By the day they turn urgent, then priority ("No priority" last). */
function soonestFirst(from: UrgentFrom) {
  return (a: Placed<MatrixIssue>, b: Placed<MatrixIssue>) => {
    const [fromA, fromB] = [from(a) ?? "", from(b) ?? ""];
    if (fromA !== fromB) return fromA < fromB ? -1 : 1;
    return byPriority(a.priority, b.priority);
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
  const tally = new Map<LinearPriority, number>();
  for (const { priority } of issues) tally.set(priority, (tally.get(priority) ?? 0) + 1);
  const parts = [...tally]
    .sort(([a], [b]) => byPriority(a, b))
    .map(([priority, n]) => `${n} ${PRIORITY_LABEL[priority]}${n === 1 ? "" : "s"}`);
  return `${list(parts)} ${issues.length === 1 ? "becomes" : "become"} urgent`;
}

/** Worst first. Fog is an unknown, so it ranks below any measured overload. */
const SEVERITY: Record<WeatherKind, number> = { storm: 4, rain: 3, fog: 2, cloudy: 1, sunny: 0 };

function worstWeek<I>(weeks: ForecastWeek<I>[]): ForecastWeek<I> {
  return weeks.reduce((worst, week) =>
    SEVERITY[week.weather.kind] > SEVERITY[worst.weather.kind] ? week : worst,
  );
}
