// Rebalance suggestions: which issues to hand from whom to whom so nobody is under rain or in a
// storm, now or in the weeks ahead. A greedy pass over the weather and forecast, and as pure.

import {
  isForecastHorizon,
  MAX_FORECAST_WEEKS,
  project,
  type UrgentFrom,
  urgentFrom,
} from "./forecast";
import {
  byPriority,
  isImportant,
  type Matrix,
  type MatrixIssue,
  type Placed,
  sizeIn,
} from "./matrix";
import { addDays, type CalendarDate } from "./quadrant";
import {
  DEFAULT_THRESHOLDS,
  type LoadMetric,
  loadMetricFor,
  ratioOf,
  teamWeather,
  times,
  urgentLoad,
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

/** Someone and the issues they hold, and whether they can be handed more (by default they can). */
type Holding<P, I> = P & { matrix: Matrix<I>; takesWork?: boolean };

/**
 * Moves that bring everyone's urgent load within the thresholds, in the order to make them.
 *
 * Greedy: while someone is under rain or in a storm by load, the busiest person hands one issue
 * to the least busy, picking the issue that leaves the two closest. When they have nothing that
 * helps (all overdue, say), the next busiest gives, or the next least busy takes. It stops when
 * nobody is overloaded, or no single move helps.
 *
 * - **now** moves work that is urgent today.
 * - **forecast** heads off storms before they arrive, starting from the board as today's moves
 *   (counted as the weather counts them) leave it. Week by week, it settles each week before
 *   looking at the next, moving work that isn't urgent yet but will be by that week's end. An
 *   issue weighs on every week from when it turns urgent until it's due, so a move must even out
 *   those weeks taken together, not just the one it's for, and leave none of them less even:
 *   easing week 3 mustn't bury the taker in week 2, which was settled already.
 *
 * Each issue moves at most once, and only if it narrows the gap between giver and taker.
 *
 * Nobody takes on work while they have overdue issues, or while their load can't be measured, or
 * when they can't take work at all (`takesWork: false`, e.g. someone off the team).
 * Overdue issues stay put: moving them only moves the storm. Without a `metric`, load is counted
 * as the weather (now) or forecast would count it on today's board.
 */
export function rebalance<I extends MatrixIssue, P extends { name: string }>(
  people: readonly Holding<P, I>[],
  horizon: Horizon,
  metric: LoadMetric | null,
  today: CalendarDate,
  options: RebalanceOptions = {},
): Suggestion<P, I>[] {
  const now = rebalanceNow(people, horizon === "now" ? metric : null, today, options);
  return horizon === "now" ? now.suggestions : rebalanceAhead(now.after, metric, today, options);
}

/** Today's moves, and the board as they leave it, for `rebalanceAhead` to start from. */
export function rebalanceNow<I extends MatrixIssue, P extends { name: string }>(
  people: readonly Holding<P, I>[],
  metric: LoadMetric | null,
  today: CalendarDate,
  { thresholds = DEFAULT_THRESHOLDS }: RebalanceOptions = {},
): { suggestions: Suggestion<P, I>[]; after: Holding<P, I>[] } {
  const { state, settle, suggestions, after } = balancer(people, today, thresholds);
  // Counted the same way all the way through, whoever ends up holding what.
  const counted = metric ?? loadMetricFor(state.map(({ matrix }) => matrix));
  settle(
    () => {
      const weather = teamWeather(state, counted, today, thresholds);
      return [
        {
          week: null,
          loads: weather.people.map(({ load }) => load),
          teamAverage: weather.team.teamAverage,
          movable: state.map(
            ({ matrix }) =>
              new Set(
                [...matrix.do, ...matrix.delegate].filter(
                  (i) => i.dueDate === null || i.dueDate >= today,
                ),
              ),
          ),
        },
      ];
    },
    0,
    counted,
  );
  return { suggestions, after: after() };
}

/** The forecast's moves, week by week, from `people` as they stand (after today's moves). */
export function rebalanceAhead<I extends MatrixIssue, P extends { name: string }>(
  people: readonly Holding<P, I>[],
  metric: LoadMetric | null,
  today: CalendarDate,
  { weeks = 4, thresholds = DEFAULT_THRESHOLDS }: RebalanceOptions = {},
): Suggestion<P, I>[] {
  if (!isForecastHorizon(weeks)) {
    throw new RangeError(`A forecast covers 1 to ${MAX_FORECAST_WEEKS} weeks, not ${weeks}`);
  }
  const { state, settle, suggestions } = balancer(people, today, thresholds);
  // When an issue turns urgent doesn't depend on who holds it, and is worked out on each read,
  // so read it once.
  const firstUrgent = new Map(
    state
      .flatMap(({ matrix }) => Object.values(matrix).flat())
      .map((i) => [i, urgentFrom(i, today)]),
  );
  const from: UrgentFrom = (issue) => firstUrgent.get(issue as Placed<I>) ?? null;
  const ends = Array.from({ length: weeks }, (_, week) => addDays(today, 7 * week + 6));
  /** Everyone's matrix as it should stand at each week's end, as the moves so far leave it. */
  const projectAll = () =>
    ends.map((endsOn) =>
      state.map(({ name, matrix }) => ({ name, matrix: project(matrix, from, today, endsOn) })),
    );
  // As the forecast counts it: points only if every issue urgent in any week is estimated.
  const counted =
    metric ?? loadMetricFor(projectAll().flatMap((week) => week.map((p) => p.matrix)));

  const rounds = (): Round<I>[] =>
    projectAll().map((projected, week) => {
      const weather = teamWeather(projected, counted, today, thresholds);
      return {
        week: week + 1,
        loads: weather.people.map(({ load }) => load),
        teamAverage: weather.team.teamAverage,
        // Urgent by the week's end, but not today.
        movable: projected.map(
          ({ matrix }) =>
            new Set(
              [...matrix.do, ...matrix.delegate].filter(
                (i) => i.quadrant === "schedule" || i.quadrant === "drop",
              ),
            ),
        ),
      };
    });
  for (let week = 0; week < weeks; week++) settle(rounds, week, counted);
  return suggestions;
}

/** Moves made on copies of `people`'s matrices, so each round reads the weather earlier ones leave. */
function balancer<I extends MatrixIssue, P extends { name: string }>(
  people: readonly Holding<P, I>[],
  today: CalendarDate,
  thresholds: WeatherThresholds,
) {
  const state = people.map(({ name, matrix }) => ({ name, matrix: copy(matrix) }));
  const overdue = state.map(({ matrix }) => urgentLoad(matrix, "issues", today).overdue > 0);
  const takes = people.map(({ takesWork }) => takesWork !== false);
  const suggestions: Suggestion<P, I>[] = [];
  const moved = new Set<Placed<I>>();

  /** Makes moves in one round until it's balanced, or no move helps. */
  function settle(rounds: () => Round<I>[], at: number, counted: LoadMetric) {
    const size = sizeIn(counted);
    // Each issue moves at most once, so this ends.
    for (;;) {
      const all = rounds();
      const round = all[at];
      if (!round) return;
      // Evens out the giver's and taker's load over every round the issue counts in: the change
      // in the sum of their squared loads, which a fairer split lowers. No round may get less
      // even, so the taker never ends up above where the giver started, even in a week already
      // settled.
      const fits = (issue: Placed<I>, giver: number, taker: number) => {
        if (moved.has(issue)) return false;
        const s = size(issue);
        let change = 0;
        for (const { loads, movable } of all) {
          const [g, t] = [loads[giver], loads[taker]];
          if (g == null || t == null || !movable[giver]?.has(issue)) continue;
          if (t + s > g) return false;
          change += s * (s + t - g);
        }
        return change < 0;
      };
      const move = bestMove(round, overdue, takes, size, fits, thresholds);
      if (!move) return;
      const { issue } = move;
      moved.add(issue);
      const giver = state[move.from] as (typeof state)[number];
      const taker = state[move.to] as (typeof state)[number];
      giver.matrix[issue.quadrant] = giver.matrix[issue.quadrant].filter((i) => i !== issue);
      taker.matrix[issue.quadrant] = [...taker.matrix[issue.quadrant], issue];

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

  const after = (): Holding<P, I>[] =>
    people.map((person, i) => ({ ...person, matrix: (state[i] as (typeof state)[number]).matrix }));
  return { state, settle, suggestions, after };
}

/** One moment to balance: now, or a forecast week. */
interface Round<I> {
  /** The forecast week, from 1; null for now. */
  week: number | null;
  /** Each person's urgent load, null when it can't be measured. */
  loads: (number | null)[];
  teamAverage: number | null;
  /** What each person could hand over. */
  movable: Set<Placed<I>>[];
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
 * The best handover from the busiest overloaded person who has one, to the least busy person who
 * can take it, or null if nobody is overloaded or no issue that `fits` narrows a gap.
 */
function bestMove<I extends MatrixIssue>(
  { loads, teamAverage, movable }: Round<I>,
  overdue: boolean[],
  takes: boolean[],
  size: (issue: MatrixIssue) => number,
  fits: (issue: Placed<I>, giver: number, taker: number) => boolean,
  thresholds: WeatherThresholds,
): Move<I> | null {
  if (teamAverage === null) return null;
  const measured = loads.flatMap((load, i) => (load === null ? [] : [{ i, load }]));
  // Busiest first and least busy first; ties go to whoever comes first.
  const givers = [...measured]
    .sort((a, b) => b.load - a.load)
    .filter(({ load }) => {
      const kind = weatherFor(load, teamAverage, false, thresholds);
      return kind === "rain" || kind === "storm";
    });
  const takers = measured
    .filter(({ i }) => !overdue[i] && takes[i])
    .sort((a, b) => a.load - b.load);

  for (const giver of givers) {
    for (const taker of takers) {
      const gap = giver.load - taker.load;
      if (gap <= 0) break;
      const [issue] = [...(movable[giver.i] ?? [])]
        .filter((i) => size(i) > 0 && size(i) < gap && fits(i, giver.i, taker.i))
        .sort(
          (a, b) =>
            // Leaves the two closest, then work that isn't important, then the least important.
            Math.abs(gap - 2 * size(a)) - Math.abs(gap - 2 * size(b)) ||
            Number(isImportant(a)) - Number(isImportant(b)) ||
            byPriority(b.priority, a.priority),
        );
      if (issue) {
        return {
          issue,
          size: size(issue),
          from: giver.i,
          to: taker.i,
          fromLoad: giver.load,
          toLoad: taker.load,
        };
      }
    }
  }
  return null;
}

function copy<I>(matrix: Matrix<I>): Matrix<I> {
  return {
    do: [...matrix.do],
    schedule: [...matrix.schedule],
    delegate: [...matrix.delegate],
    drop: [...matrix.drop],
  };
}
