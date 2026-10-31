// The weather now: each person's urgent load (Do + Delegate) against the team's average, and
// how evenly the team's urgent load is spread. Pure, like the rules engine it builds on.

import { counts, type Matrix, type MatrixIssue, points } from "./matrix";
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
 * - Overdue urgent issues → storm, however light the load: they're already late.
 * - `load` null means it can't be measured → fog.
 * - No urgent load → sunny: room for more.
 * - `teamAverage` null means there's nobody to compare with → fog.
 *
 * The ratio is rounded to hundredths first, as the reason shows it, so the same shown ratio
 * always gives the same weather.
 */
export function weatherFor(
  load: number | null,
  teamAverage: number | null,
  hasOverdue: boolean,
  thresholds: WeatherThresholds = DEFAULT_THRESHOLDS,
): WeatherKind {
  if (hasOverdue) return "storm";
  if (load === null) return "fog";
  if (load === 0) return "sunny";
  if (teamAverage === null) return "fog";
  const ratio = ratioOf(load, teamAverage);
  if (ratio > thresholds.stormAbove) return "storm";
  if (ratio > thresholds.rainAbove) return "rain";
  if (ratio < thresholds.sunnyBelow) return "sunny";
  return "cloudy";
}

/** A load as a multiple of the average, to hundredths. */
function ratioOf(load: number, teamAverage: number): number {
  return Math.round((load / teamAverage) * 100) / 100;
}

/**
 * Points when every urgent issue the team's people hold is estimated, else issues. Points
 * would undercount anyone whose urgent work isn't all estimated, and issues the team never
 * looks at as urgent (unassigned, or not urgent yet) say nothing about how it measures load.
 */
export function loadMetricFor(matrices: readonly Matrix<MatrixIssue>[]): LoadMetric {
  const urgent = matrices.flatMap((matrix) => [...matrix.do, ...matrix.delegate]);
  return urgent.length > 0 && urgent.every((issue) => issue.estimate != null) ? "points" : "issues";
}

export interface Load {
  /** Urgent (Do + Delegate) load in the metric, or null when it can't be measured. */
  load: number | null;
  /** How many urgent issues there are, whatever the metric. */
  urgent: number;
  /** How many urgent (Do or Delegate) issues are past their due date. Moving one out of Do by
   * hand doesn't make it any less late. */
  overdue: number;
  /** Why the load can't be measured, when it can't. */
  unknown?: "unestimated" | "undated";
}

/**
 * A matrix's urgent load. It can't be measured (null) when:
 * - counting points, some urgent issue isn't estimated, so points would undercount; or
 * - it has nothing urgent but holds undated issues, so it may be busy rather than idle.
 */
export function urgentLoad(
  matrix: Matrix<MatrixIssue>,
  metric: LoadMetric,
  today: CalendarDate,
): Load {
  const urgentIssues = [...matrix.do, ...matrix.delegate];
  const urgent = urgentIssues.length;
  const overdue = urgentIssues.filter((i) => i.dueDate !== null && i.dueDate < today).length;
  if (metric === "points" && urgentIssues.some((i) => i.estimate == null)) {
    return { load: null, urgent, overdue, unknown: "unestimated" };
  }
  const undated = [...matrix.schedule, ...matrix.drop].some((i) => i.dueDate === null);
  if (urgent === 0 && undated) return { load: null, urgent, overdue, unknown: "undated" };
  const tally = (metric === "points" ? points : counts)(matrix);
  return { load: tally.do + tally.delegate, urgent, overdue };
}

export interface Weather {
  kind: WeatherKind;
  metric: LoadMetric;
  /** A person's urgent load; for a team, its busiest person's. Null when it can't be measured. */
  load: number | null;
  /** The mean urgent load of the people whose load could be measured. Null when fewer than
   * two could: nobody to compare with. */
  teamAverage: number | null;
  /** Why, e.g. "13 urgent points, 3.07× the team average; 2 issues overdue". */
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
    measured.length < 2 ? null : measured.reduce((sum, load) => sum + load, 0) / measured.length;

  const weathers = loads.map((load) => weatherOf(load, teamAverage, metric, thresholds));

  return { people: weathers, team: spread(people, weathers, metric, teamAverage) };
}

function weatherOf(
  measured: Load,
  teamAverage: number | null,
  metric: LoadMetric,
  thresholds: WeatherThresholds,
): Weather {
  const { load, overdue } = measured;
  return {
    kind: weatherFor(load, teamAverage, overdue > 0, thresholds),
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
  if (busiest === 0) {
    return { ...base, kind: "sunny", reason: "Nothing urgent on anyone's plate" };
  }
  if (teamAverage === null) {
    const reason =
      busiest === null
        ? "Nobody's urgent load can be measured"
        : "Only one person's urgent load can be measured";
    return { ...base, kind: "fog", reason };
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
  { load, urgent, overdue: late, unknown }: Load,
  teamAverage: number | null,
  metric: LoadMetric,
): string {
  const overdue = late === 0 ? "" : `${plural(late, "issue")} overdue`;
  if (load === null) {
    const why =
      unknown === "unestimated"
        ? "not every urgent issue is estimated"
        : "nothing urgent, but some work has no due date";
    return overdue ? `${overdue}; ${why}` : `${why[0]?.toUpperCase()}${why.slice(1)}`;
  }
  if (urgent === 0) return "Nothing urgent";
  const amount =
    metric === "issues"
      ? plural(load, "urgent issue")
      : load === 0
        ? `${plural(urgent, "urgent issue")}, estimated at 0 points`
        : plural(load, "urgent point");
  const vsAverage =
    load === 0
      ? ""
      : teamAverage === null
        ? ", nobody else to compare with"
        : `, ${times(ratioOf(load, teamAverage))} the team average`;
  return `${amount}${vsAverage}${overdue ? `; ${overdue}` : ""}`;
}

function plural(n: number, unit: string): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${unit}${n === 1 ? "" : "s"}`;
}

/** A ratio as weatherFor reads it: to hundredths, e.g. "1.0×", "1.2×" or "3.07×". */
function times(ratio: number): string {
  return `${Number.isInteger(ratio) ? ratio.toFixed(1) : ratio}×`;
}

/** E.g. "Ana, Ben and Cy". */
export function list(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
