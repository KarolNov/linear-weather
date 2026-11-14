// The weather now: each person's urgent load (Do + Delegate) against their fair share of the
// team's, and how evenly the team's urgent load is spread. Pure, like the rules engine it builds on.

import { describeCapacity, FULL_TIME } from "./capacity";
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
 * One person's weather, from their urgent load against their fair share of it: the team's
 * average, scaled by their capacity.
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
  share: number | null,
  hasOverdue: boolean,
  thresholds: WeatherThresholds = DEFAULT_THRESHOLDS,
): WeatherKind {
  if (hasOverdue) return "storm";
  if (load === null) return "fog";
  if (load === 0) return "sunny";
  if (share === null) return "fog";
  const ratio = ratioOf(load, share);
  if (ratio > thresholds.stormAbove) return "storm";
  if (ratio > thresholds.rainAbove) return "rain";
  if (ratio < thresholds.sunnyBelow) return "sunny";
  return "cloudy";
}

/** A load as a multiple of a share of the team's, to hundredths. */
export function ratioOf(load: number, share: number): number {
  return Math.round((load / share) * 100) / 100;
}

/**
 * Someone's fair share of the urgent load: the team's load per full-time person, scaled by their
 * capacity. Null with nobody to compare with.
 */
export function shareOf(teamAverage: number | null, capacity = FULL_TIME): number | null {
  return teamAverage === null ? null : teamAverage * capacity;
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
  /** The team's urgent load per full-time person: everyone's whose load could be measured,
   * over their capacities added up. With everyone full time, the mean. Null when fewer than two
   * could be measured: nobody to compare with. */
  teamAverage: number | null;
  /** Urgent (Do or Delegate) issues past their due date; for a team, everyone's. */
  overdue: number;
  /** Why, e.g. "13 urgent points, 3.07× the team average; 2 issues overdue". */
  reason: string;
}

export interface TeamWeather {
  /** Each person's weather, in the order given. */
  people: Weather[];
  /** How evenly the urgent load is spread. */
  team: Weather;
}

/** Someone whose weather is asked for, and how much of a full-time week they work (1 if left out). */
export interface Staffed<I extends MatrixIssue = MatrixIssue> {
  name: string;
  matrix: Matrix<I>;
  capacity?: number;
}

/**
 * Everyone's weather, and the team's. Each person's load is compared with their fair share: the
 * team's load per full-time person (`teamAverage`), scaled by their capacity. That covers
 * everyone who could be measured, including people with nothing urgent: they are the team's
 * spare capacity. It depends only on totals, so handing work from one person to another
 * doesn't move it.
 *
 * The team is as stormy or rainy as its worst person, since one overload is a reason to
 * rebalance. Otherwise it's sunny when everyone is around the average (evenly spread), and
 * cloudy when some have room while others carry the load.
 */
export function teamWeather(
  people: readonly Staffed[],
  metric: LoadMetric,
  today: CalendarDate,
  thresholds: WeatherThresholds = DEFAULT_THRESHOLDS,
): TeamWeather {
  const loads = people.map(({ matrix }) => urgentLoad(matrix, metric, today));
  const capacities = people.map(({ capacity }) => capacity ?? FULL_TIME);
  const teamAverage = fairShare(
    loads.map(({ load }) => load),
    capacities,
  );

  const weathers = loads.map((load, i) =>
    weatherOf(load, teamAverage, capacities[i] ?? FULL_TIME, metric, thresholds),
  );

  return { people: weathers, team: spread(people, weathers, capacities, metric, teamAverage) };
}

/**
 * The team's urgent load per full-time person: the measured loads over those people's capacities
 * added up. Null when fewer than two could be measured.
 */
export function fairShare(
  loads: readonly (number | null)[],
  capacities: readonly number[],
): number | null {
  let total = 0;
  let staff = 0;
  let measured = 0;
  loads.forEach((load, i) => {
    if (load === null) return;
    total += load;
    staff += capacities[i] ?? FULL_TIME;
    measured++;
  });
  return measured < 2 ? null : total / staff;
}

function weatherOf(
  measured: Load,
  teamAverage: number | null,
  capacity: number,
  metric: LoadMetric,
  thresholds: WeatherThresholds,
): Weather {
  const { load, overdue } = measured;
  return {
    kind: weatherFor(load, shareOf(teamAverage, capacity), overdue > 0, thresholds),
    metric,
    load,
    teamAverage,
    overdue,
    reason: describeLoad(measured, teamAverage, capacity, metric),
  };
}

function spread(
  people: readonly { name: string }[],
  weathers: Weather[],
  capacities: readonly number[],
  metric: LoadMetric,
  teamAverage: number | null,
): Weather {
  // The busiest is whoever carries the most for their capacity.
  let busiest: number | null = null;
  let most = Number.NEGATIVE_INFINITY;
  for (const [i, { load }] of weathers.entries()) {
    if (load === null) continue;
    const perFullTime = load / (capacities[i] ?? FULL_TIME);
    if (perFullTime > most) [busiest, most] = [load, perFullTime];
  }
  const overdue = weathers.reduce((sum, weather) => sum + weather.overdue, 0);
  const base = { metric, load: busiest, teamAverage, overdue };
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
  capacity: number,
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
  const partTime = capacity === FULL_TIME ? "" : ` at ${describeCapacity(capacity)}`;
  const share = shareOf(teamAverage, capacity);
  const vsShare =
    load === 0
      ? ""
      : share === null
        ? ", nobody else to compare with"
        : `, ${times(ratioOf(load, share))} ${partTime ? "their share" : "the team average"}`;
  return `${amount}${partTime}${vsShare}${overdue ? `; ${overdue}` : ""}`;
}

function plural(n: number, unit: string): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${unit}${n === 1 ? "" : "s"}`;
}

/** A ratio as weatherFor reads it: to hundredths, e.g. "1.0×", "1.2×" or "3.07×". */
export function times(ratio: number): string {
  return `${Number.isInteger(ratio) ? ratio.toFixed(1) : ratio}×`;
}

/** E.g. "Ana, Ben and Cy". */
export function list(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
