// Rebalance suggestions: which issues to hand from whom to whom so nobody is under rain or in a
// storm, now or in the weeks ahead. A greedy pass over the weather and forecast, and as pure.

import { forecast, project, type UrgentFrom, urgentFrom } from "./forecast";
import { byPriority, type Matrix, type MatrixIssue, type Placed } from "./matrix";
import type { CalendarDate } from "./quadrant";
import {
  DEFAULT_THRESHOLDS,
  type LoadMetric,
  loadMetricFor,
  ratioOf,
  teamWeather,
  times,
  type WeatherKind,
  type WeatherThresholds,
  weatherFor,
} from "./weather";

/** Today's storms, or the ones the forecast sees coming. */
export type Horizon = "now" | "forecast";

export interface Suggestion<P, I> {
  issue: Placed<I>;
  from: P;
  to: P;
  /** The forecast week the move heads a storm off in (1 = this week); null for now. */
  week: number | null;
  /** The giver's weather after the move, now or in that week. */
  fromWeather: WeatherKind;
  /** The taker's weather after the move, now or in that week. */
  toWeather: WeatherKind;
  /** E.g. "Ana goes from 2.1× to 1.4× the team average, Ben from 0.5× to 1.1×". */
  reason: string;
}

export interface RebalanceOptions {
  /** How far ahead the forecast looks. */
  weeks?: number;
  thresholds?: WeatherThresholds;
}

/**
 * Moves that bring everyone's urgent load within the thresholds, in the order to make them.
 *
 * Greedy: while someone is under rain or in a storm by load, the busiest person hands one issue
 * to the least busy, picking the issue that leaves the two closest. It stops when nobody is
 * overloaded, or no single move helps.
 *
 * - **now** moves work that is urgent today.
 * - **forecast** heads off storms before they arrive, starting from the board as today's moves
 *   leave it. Week by week, it settles each week before looking at the next, moving work that
 *   isn't urgent yet but will be by that week's end. An issue weighs on every week from when it
 *   turns urgent until it's due, so a move must even out those weeks taken together, not just
 *   the one it's for: easing week 3 mustn't bury the taker in week 2.
 *
 * Each issue moves at most once, and only if it narrows the gap between giver and taker.
 *
 * Nobody takes on work while they have overdue issues, or while their load can't be measured.
 * Overdue issues stay put: moving them only moves the storm. Without a `metric`, load is counted
 * as the weather (now) or forecast would count it on today's board.
 */
export function rebalance<I extends MatrixIssue, P extends { name: string }>(
  people: readonly (P & { matrix: Matrix<I> })[],
  horizon: Horizon,
  metric: LoadMetric | null,
  today: CalendarDate,
  { weeks = 4, thresholds = DEFAULT_THRESHOLDS }: RebalanceOptions = {},
): Suggestion<P, I>[] {
  // Moves are made on copies, so each round reads the weather the earlier ones leave.
  const state = people.map(({ name, matrix }) => ({ name, matrix: copy(matrix) }));
  const overdue = state.map(({ matrix }) => hasOverdue(matrix, today));
  const from: UrgentFrom = (issue) => urgentFrom(issue, today);
  // Counted the same way all the way through, whoever ends up holding what.
  const nowMetric = metric ?? loadMetricFor(state.map(({ matrix }) => matrix));
  const forecastMetric =
    horizon === "forecast"
      ? (metric ??
        forecast(state, null, today, weeks, thresholds).team[0]?.weather.metric ??
        "issues")
      : nowMetric;

  /** Today, as the moves so far leave it. */
  function now(): Round<I>[] {
    const weather = teamWeather(state, nowMetric, today, thresholds);
    return [
      {
        week: null,
        loads: weather.people.map(({ load }) => load),
        teamAverage: weather.team.teamAverage,
        movable: state.map(({ matrix }) =>
          [...matrix.do, ...matrix.delegate].filter(
            (i) => i.dueDate === null || i.dueDate >= today,
          ),
        ),
      },
    ];
  }

  /** Each forecast week, as the moves so far leave it. */
  function ahead(): Round<I>[] {
    const projected = forecast(state, forecastMetric, today, weeks, thresholds);
    return projected.team.map(({ endsOn, weather }, week) => ({
      week: week + 1,
      loads: projected.people.map((theirs) => theirs[week]?.weather.load ?? null),
      teamAverage: weather.teamAverage,
      // Urgent by the week's end, but not today.
      movable: state.map(({ matrix }) => {
        const then = project(matrix, from, today, endsOn);
        return [...then.do, ...then.delegate].filter(
          (i) => i.quadrant === "schedule" || i.quadrant === "drop",
        );
      }),
    }));
  }

  const suggestions: Suggestion<P, I>[] = [];
  const moved = new Set<Placed<I>>();

  /** Makes moves in one round until it's balanced, or no move helps. */
  function settle(rounds: () => Round<I>[], at: number, counted: LoadMetric, report: boolean) {
    const size = sizeIn(counted);
    // Each issue moves at most once, so this ends.
    for (;;) {
      const all = rounds();
      const round = all[at];
      if (!round) return;
      // Evens out the giver's and taker's load over every round the issue counts in: the change
      // in the sum of their squared loads, which a fairer split lowers.
      const fits = (issue: Placed<I>, giver: number, taker: number) => {
        if (moved.has(issue)) return false;
        const s = size(issue);
        let change = 0;
        for (const { loads, movable } of all) {
          const [g, t] = [loads[giver], loads[taker]];
          if (g == null || t == null || !movable[giver]?.includes(issue)) continue;
          change += s * (s + t - g);
        }
        return change < 0;
      };
      const move = bestMove(round, overdue, size, fits, thresholds);
      if (!move) return;
      const { issue } = move;
      moved.add(issue);
      const giver = state[move.from] as (typeof state)[number];
      const taker = state[move.to] as (typeof state)[number];
      giver.matrix[issue.quadrant] = giver.matrix[issue.quadrant].filter((i) => i !== issue);
      taker.matrix[issue.quadrant] = [...taker.matrix[issue.quadrant], issue];
      if (!report) continue;

      // Both were measured before and after, so the average doesn't move.
      const average = round.teamAverage as number;
      const fromAfter = move.fromLoad - move.size;
      const toAfter = move.toLoad + move.size;
      const ratio = (load: number) => times(ratioOf(load, average));
      suggestions.push({
        issue,
        from: people[move.from] as P,
        to: people[move.to] as P,
        week: round.week,
        fromWeather: weatherFor(fromAfter, average, overdue[move.from] ?? false, thresholds),
        toWeather: weatherFor(toAfter, average, false, thresholds),
        reason: `${giver.name} goes from ${ratio(move.fromLoad)} to ${ratio(fromAfter)} the team average, ${taker.name} from ${ratio(move.toLoad)} to ${ratio(toAfter)}`,
      });
    }
  }

  // The forecast assumes today's moves were made, then settles the weeks in order.
  settle(now, 0, nowMetric, horizon === "now");
  if (horizon === "forecast") {
    for (let week = 0; week < weeks; week++) settle(ahead, week, forecastMetric, true);
  }
  return suggestions;
}

/** One moment to balance: now, or a forecast week. */
interface Round<I> {
  /** The forecast week, from 1; null for now. */
  week: number | null;
  /** Each person's urgent load, null when it can't be measured. */
  loads: (number | null)[];
  teamAverage: number | null;
  /** What each person could hand over. */
  movable: Placed<I>[][];
}

interface Move<I> {
  issue: Placed<I>;
  size: number;
  from: number;
  to: number;
  fromLoad: number;
  toLoad: number;
}

/**
 * The busiest person's best handover to the least busy, or null if nobody is overloaded or no
 * issue that `fits` narrows the gap between them.
 */
function bestMove<I extends MatrixIssue>(
  { loads, teamAverage, movable }: Round<I>,
  overdue: boolean[],
  size: (issue: MatrixIssue) => number,
  fits: (issue: Placed<I>, giver: number, taker: number) => boolean,
  thresholds: WeatherThresholds,
): Move<I> | null {
  if (teamAverage === null) return null;
  const measured = loads.flatMap((load, i) => (load === null ? [] : [{ i, load }]));
  const giver = measured.reduce<{ i: number; load: number } | null>(
    (most, person) => (most === null || person.load > most.load ? person : most),
    null,
  );
  if (!giver) return null;
  const kind = weatherFor(giver.load, teamAverage, false, thresholds);
  if (kind !== "rain" && kind !== "storm") return null;
  const taker = measured
    .filter(({ i }) => i !== giver.i && !overdue[i])
    .reduce<{ i: number; load: number } | null>(
      (least, person) => (least === null || person.load < least.load ? person : least),
      null,
    );
  if (!taker) return null;

  const gap = giver.load - taker.load;
  const [issue] = (movable[giver.i] ?? [])
    .filter((i) => size(i) > 0 && size(i) < gap && fits(i, giver.i, taker.i))
    .sort(
      (a, b) =>
        // Leaves the two closest, then work that isn't important, then the least important.
        Math.abs(gap - 2 * size(a)) - Math.abs(gap - 2 * size(b)) ||
        Number(isImportant(a)) - Number(isImportant(b)) ||
        byPriority(b.priority, a.priority),
    );
  if (!issue) return null;
  return {
    issue,
    size: size(issue),
    from: giver.i,
    to: taker.i,
    fromLoad: giver.load,
    toLoad: taker.load,
  };
}

function isImportant(issue: Placed<MatrixIssue>): boolean {
  return issue.quadrant === "do" || issue.quadrant === "schedule";
}

function sizeIn(metric: LoadMetric): (issue: MatrixIssue) => number {
  return metric === "points" ? (issue) => issue.estimate ?? 0 : () => 1;
}

function hasOverdue(matrix: Matrix<MatrixIssue>, today: CalendarDate): boolean {
  return [...matrix.do, ...matrix.delegate].some((i) => i.dueDate !== null && i.dueDate < today);
}

function copy<I>(matrix: Matrix<I>): Matrix<I> {
  return {
    do: [...matrix.do],
    schedule: [...matrix.schedule],
    delegate: [...matrix.delegate],
    drop: [...matrix.drop],
  };
}
