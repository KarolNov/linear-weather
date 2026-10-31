// The weather now: each person's urgent load (Do + Delegate) against the team's average, and
// how evenly the team's urgent load is spread. Pure, like the rules engine it builds on.

import type { Matrix, MatrixIssue } from "./matrix";
import type { CalendarDate } from "./quadrant";

export const WEATHER_KINDS = ["sunny", "cloudy", "rain", "storm", "fog"] as const;

export type WeatherKind = (typeof WEATHER_KINDS)[number];

/** What load is counted in: estimate points, or issues. */
export type LoadMetric = "points" | "issues";

/** Where the weather turns, as multiples of the team's average load. */
export interface WeatherThresholds {
  /** Sunny below this: room for more. */
  sunnyBelow: number;
  /** Rain above this. */
  rainAbove: number;
  /** Storm above this, whatever else. */
  stormAbove: number;
}

export const DEFAULT_THRESHOLDS: WeatherThresholds = {
  sunnyBelow: 0.75,
  rainAbove: 1.25,
  stormAbove: 1.5,
};

/**
 * One person's weather, from their urgent load against the team's average.
 *
 * - Overdue Do issues → storm, however light the load: they're already late.
 * - `load` null means it can't be measured → fog.
 * - No urgent load across the team (average 0) → sunny: everyone has room.
 */
export function weatherFor(
  load: number | null,
  teamAverage: number,
  hasOverdueDo: boolean,
  thresholds: WeatherThresholds = DEFAULT_THRESHOLDS,
): WeatherKind {
  if (hasOverdueDo) return "storm";
  if (load === null) return "fog";
  if (teamAverage <= 0) return "sunny";
  const ratio = load / teamAverage;
  if (ratio > thresholds.stormAbove) return "storm";
  if (ratio > thresholds.rainAbove) return "rain";
  if (ratio < thresholds.sunnyBelow) return "sunny";
  return "cloudy";
}

/**
 * Points when the team estimates, else issues. A team estimates when any of its open issues
 * has an estimate: a team that turned estimates on in Linear but never uses them is better
 * measured by count.
 */
export function loadMetricFor(issues: readonly MatrixIssue[]): LoadMetric {
  return issues.some((issue) => issue.estimate != null) ? "points" : "issues";
}

export interface Load {
  /** Urgent (Do + Delegate) load in the metric, or null when it can't be measured. */
  load: number | null;
  /** How many Do issues are past their due date. */
  overdueDo: number;
  /** Why the load can't be measured, when it can't. */
  unknown?: "unestimated" | "undated";
}

/**
 * A matrix's urgent load. It can't be measured (null) when:
 * - counting points, it has urgent issues but none are estimated; or
 * - it has no urgent load but holds undated issues, so it may be busy rather than idle.
 * Partly estimated urgent work counts the estimated issues only.
 */
export function urgentLoad(
  matrix: Matrix<MatrixIssue>,
  metric: LoadMetric,
  today: CalendarDate,
): Load {
  const urgent = [...matrix.do, ...matrix.delegate];
  const overdueDo = matrix.do.filter((i) => i.dueDate !== null && i.dueDate < today).length;
  const estimated = urgent.filter((i) => i.estimate != null);
  if (metric === "points" && urgent.length > 0 && estimated.length === 0) {
    return { load: null, overdueDo, unknown: "unestimated" };
  }
  const load =
    metric === "points" ? estimated.reduce((sum, i) => sum + (i.estimate ?? 0), 0) : urgent.length;
  const undated = [...matrix.schedule, ...matrix.drop].some((i) => i.dueDate === null);
  if (load === 0 && undated) return { load: null, overdueDo, unknown: "undated" };
  return { load, overdueDo };
}

export interface Weather {
  kind: WeatherKind;
  metric: LoadMetric;
  /** A person's urgent load; for a team, its busiest person's. Null when it can't be measured. */
  load: number | null;
  /** The mean urgent load of the people whose load could be measured. Null when nobody's could. */
  teamAverage: number | null;
  /** Why, e.g. "13 urgent points, 3.1× the team average; 2 Do issues overdue". */
  reason: string;
}

export interface TeamWeather {
  /** Each person's weather, in the order given. */
  people: Weather[];
  /** How evenly the urgent load is spread. */
  team: Weather;
}

/**
 * Everyone's weather, and the team's. The average covers everyone who could be measured,
 * including people with nothing urgent: they are the team's spare capacity.
 *
 * The team is as stormy or rainy as its worst person, since one overload is a reason to
 * rebalance. Otherwise it's sunny when everyone is around the average (evenly spread), and
 * cloudy when some have room while others carry the load.
 */
export function teamWeather(
  people: readonly { name: string; matrix: Matrix<MatrixIssue> }[],
  metric: LoadMetric,
  today: CalendarDate,
  thresholds: WeatherThresholds = DEFAULT_THRESHOLDS,
): TeamWeather {
  const loads = people.map(({ matrix }) => urgentLoad(matrix, metric, today));
  const measured = loads.flatMap(({ load }) => (load === null ? [] : [load]));
  const teamAverage =
    measured.length === 0 ? null : measured.reduce((sum, load) => sum + load, 0) / measured.length;

  const weathers = loads.map((load) => weatherOf(load, teamAverage, metric, thresholds));

  return { people: weathers, team: spread(people, weathers, metric, teamAverage) };
}

/** Someone's weather against a team's average, e.g. someone outside the team. */
export function personWeather(
  matrix: Matrix<MatrixIssue>,
  metric: LoadMetric,
  today: CalendarDate,
  teamAverage: number | null,
  thresholds: WeatherThresholds = DEFAULT_THRESHOLDS,
): Weather {
  return weatherOf(urgentLoad(matrix, metric, today), teamAverage, metric, thresholds);
}

function weatherOf(
  measured: Load,
  teamAverage: number | null,
  metric: LoadMetric,
  thresholds: WeatherThresholds,
): Weather {
  const { load, overdueDo } = measured;
  return {
    kind: weatherFor(load, teamAverage ?? 0, overdueDo > 0, thresholds),
    metric,
    load,
    teamAverage,
    reason: describeLoad(measured, teamAverage, metric),
  };
}

function spread(
  people: readonly { name: string }[],
  weathers: Weather[],
  metric: LoadMetric,
  teamAverage: number | null,
): Weather {
  const busiest = weathers.reduce<number | null>(
    (most, { load }) => (load !== null && (most === null || load > most) ? load : most),
    null,
  );
  const base = { metric, load: busiest, teamAverage };
  const names = (kind: WeatherKind) =>
    people.filter((_, i) => weathers[i]?.kind === kind).map(({ name }) => name);

  for (const kind of ["storm", "rain"] as const) {
    const who = names(kind);
    if (who.length > 0) {
      const verb = kind === "storm" ? "in a storm" : "under rain";
      return { ...base, kind, reason: `${list(who)} ${who.length === 1 ? "is" : "are"} ${verb}` };
    }
  }
  if (teamAverage === null) {
    return { ...base, kind: "fog", reason: "Nobody's urgent load can be measured" };
  }
  if (teamAverage === 0) {
    return { ...base, kind: "sunny", reason: "Nothing urgent on anyone's plate" };
  }
  const roomy = names("sunny");
  return roomy.length === 0
    ? { ...base, kind: "sunny", reason: "Urgent load is spread evenly" }
    : {
        ...base,
        kind: "cloudy",
        reason: `${list(roomy)} ${roomy.length === 1 ? "has" : "have"} room while others carry the load`,
      };
}

function describeLoad(
  { load, overdueDo, unknown }: Load,
  teamAverage: number | null,
  metric: LoadMetric,
): string {
  const overdue = overdueDo === 0 ? "" : `${plural(overdueDo, "Do issue")} overdue`;
  if (load === null) {
    const why =
      unknown === "unestimated"
        ? "no urgent issue is estimated"
        : "nothing urgent, only undated work";
    return overdue ? `${overdue}; ${why}` : `${why[0]?.toUpperCase()}${why.slice(1)}`;
  }
  if (load === 0 && !overdue) return "Nothing urgent";
  const amount = plural(load, metric === "points" ? "urgent point" : "urgent issue");
  const vsAverage =
    teamAverage === null || teamAverage === 0
      ? ""
      : `, ${(load / teamAverage).toFixed(1)}× the team average`;
  return `${amount}${vsAverage}${overdue ? `; ${overdue}` : ""}`;
}

function plural(n: number, unit: string): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${unit}${n === 1 ? "" : "s"}`;
}

function list(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
