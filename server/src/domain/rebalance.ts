// Rebalance suggestions: which issues to hand from whom to whom so nobody is under rain or in a
// storm, now or in the weeks ahead. A greedy pass over the weather and forecast, and as pure.

import { FULL_TIME } from "./capacity";
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
  type Away,
  type Staffing,
  shortDate,
  staffingFor,
  staffingOn,
  type TimeOff,
} from "./time-off";
import {
  DEFAULT_THRESHOLDS,
  fairShare,
  type LoadMetric,
  loadMetricFor,
  ratioOf,
  shareOf,
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
  /** E.g. "Ana goes from 2.1× to 1.4× the team average, Ben from 0.5× to 1.1×", or "their
   * share" when either works part time, or "Ana is away until Nov 20; Ben goes from …". */
  reason: string;
}

export interface RebalanceOptions {
  /** How far ahead the forecast looks. */
  weeks?: number;
  thresholds?: WeatherThresholds;
}

/**
 * Someone and the issues they hold, whether they can be handed more (by default they can), how
 * much of a full-time week they work (1 if left out), and any time off.
 */
type Holding<P, I> = P & {
  matrix: Matrix<I>;
  takesWork?: boolean;
  capacity?: number;
  timeOff?: readonly TimeOff[];
};

/**
 * Moves that bring everyone's urgent load within the thresholds, in the order to make them.
 *
 * Greedy: while someone is under rain or in a storm by load, the busiest person for their
 * capacity hands one issue to the least busy for theirs, picking the issue that evens the two out
 * the most: the one that most lowers `load² / capacity` summed over both. With everyone full
 * time, that leaves the two closest. When they have nothing that
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
 * Each issue moves at most once, and only if it evens giver and taker out for their capacities
 * (lowers their `load² / capacity`), which with everyone full time narrows the gap between them.
 *
 * Urgent work held by someone away goes first, overdue or not, since nobody is doing it: most
 * pressing first, each to whoever is least busy for their capacity then. Ahead, that's the work
 * urgent in a week they're away all of.
 *
 * Nobody takes on work while they have overdue issues, or while their load can't be measured, or
 * when they can't take work at all (`takesWork: false`, e.g. someone off the team), or in a week
 * they're away. Otherwise overdue issues stay put: moving them only moves the storm. Without a `metric`, load is counted
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
  const staffing = state.map(({ capacity, timeOff }) => staffingOn(capacity, timeOff, today));
  settle(
    () => {
      const weather = teamWeather(staffed(state, staffing), counted, today, thresholds);
      return [
        {
          week: null,
          loads: weather.people.map(({ load }) => load),
          teamAverage: weather.team.teamAverage,
          capacities: staffing.map(({ capacity }) => capacity),
          away: staffing.map(({ away }) => away ?? null),
          urgent: state.map(({ matrix }) => new Set([...matrix.do, ...matrix.delegate])),
          movable: state.map(
            ({ matrix }, i) =>
              new Set(
                [...matrix.do, ...matrix.delegate].filter(
                  (issue) => staffing[i]?.away || issue.dueDate === null || issue.dueDate >= today,
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
  const spans = Array.from({ length: weeks }, (_, week) => {
    const startsOn = addDays(today, 7 * week);
    return { startsOn, endsOn: addDays(startsOn, 6) };
  });
  // Time off doesn't move with the work.
  const staffing = spans.map(({ startsOn, endsOn }) =>
    state.map(({ capacity, timeOff }) => staffingFor(capacity, timeOff, startsOn, endsOn)),
  );
  /** Everyone's matrix as it should stand at each week's end, as the moves so far leave it. */
  const projectAll = () =>
    spans.map(({ endsOn }, week) =>
      staffed(
        state.map(({ name, matrix }) => ({ name, matrix: project(matrix, from, today, endsOn) })),
        staffing[week] ?? [],
      ),
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
        capacities: projected.map(({ capacity }) => capacity ?? FULL_TIME),
        away: projected.map(({ away }) => away ?? null),
        urgent: projected.map(({ matrix }) => new Set([...matrix.do, ...matrix.delegate])),
        // Urgent by the week's end, but not today; anything urgent, from someone away.
        movable: projected.map(
          ({ matrix, away }) =>
            new Set(
              [...matrix.do, ...matrix.delegate].filter(
                (i) => away || i.quadrant === "schedule" || i.quadrant === "drop",
              ),
            ),
        ),
      };
    });
  for (let week = 0; week < weeks; week++) settle(rounds, week, counted);
  return suggestions;
}

/** People as the weather reads them over a period, with their staffing for it. */
function staffed<I extends MatrixIssue>(
  people: readonly { name: string; matrix: Matrix<I> }[],
  staffing: readonly Staffing[],
) {
  return people.map(({ name, matrix }, i) => ({ name, matrix, ...staffing[i] }));
}

/** Moves made on copies of `people`'s matrices, so each round reads the weather earlier ones leave. */
function balancer<I extends MatrixIssue, P extends { name: string }>(
  people: readonly Holding<P, I>[],
  today: CalendarDate,
  thresholds: WeatherThresholds,
) {
  const state = people.map(({ name, matrix, capacity, timeOff }) => ({
    name,
    capacity,
    timeOff,
    matrix: copy(matrix),
  }));
  const overdue = state.map(({ matrix }) => urgentLoad(matrix, "issues", today).overdue > 0);
  const takes = people.map(({ takesWork }) => takesWork !== false);
  const suggestions: Suggestion<P, I>[] = [];
  const moved = new Set<Placed<I>>();
  const isOverdue = (issue: MatrixIssue) => issue.dueDate !== null && issue.dueDate < today;

  /** Makes moves in one round until it's balanced, or no move helps. */
  function settle(rounds: () => Round<I>[], at: number, counted: LoadMetric) {
    const size = sizeIn(counted);
    // Each issue moves at most once, so this ends.
    for (;;) {
      const all = rounds();
      const round = all[at];
      if (!round) return;
      // Evens out the giver's and taker's load over every round the issue counts in: the change
      // in the sum of their `load² / capacity`, which a fairer split lowers. No round may get
      // less even, so the taker never ends up busier for their capacity than the giver started,
      // even in a week already settled. Nobody takes work in a round they're away, and any move
      // off someone away helps: nobody else would do it.
      const fits = (issue: Placed<I>, giver: number, taker: number) => {
        if (moved.has(issue)) return false;
        const s = size(issue);
        const fromAway = round.away[giver] != null;
        let change = 0;
        for (const { loads, movable, capacities, away, urgent } of all) {
          // Never to someone away while it's urgent, even in a round it can't be moved in.
          if (away[taker] && urgent[giver]?.has(issue)) return false;
          if (!movable[giver]?.has(issue)) continue;
          if (fromAway || away[giver]) continue;
          const [g, t] = [loads[giver], loads[taker]];
          if (g == null || t == null) continue;
          const [cg, ct] = [capacities[giver] ?? FULL_TIME, capacities[taker] ?? FULL_TIME];
          if ((t + s) / ct > g / cg) return false;
          change += unevenness(s, { load: g, capacity: cg }, { load: t, capacity: ct });
        }
        return fromAway || change < 0;
      };
      const move = bestMove(round, overdue, takes, size, fits, thresholds);
      if (!move) return;
      const { issue } = move;
      moved.add(issue);
      const giver = state[move.from] as (typeof state)[number];
      const taker = state[move.to] as (typeof state)[number];
      giver.matrix[issue.quadrant] = giver.matrix[issue.quadrant].filter((i) => i !== issue);
      taker.matrix[issue.quadrant] = [...taker.matrix[issue.quadrant], issue];
      const takerWasLate = overdue[move.to] ?? false;
      if (isOverdue(issue)) overdue[move.to] = true;
      suggestions.push({
        issue,
        from: people[move.from] as P,
        to: people[move.to] as P,
        week: round.week,
        ...describeMove(round, move, giver.name, taker.name, takerWasLate || isOverdue(issue)),
      });
    }
  }

  /** The two's weather after a move, and why it helps. */
  function describeMove(
    { loads, teamAverage, capacities, away }: Round<I>,
    move: Move<I>,
    giverName: string,
    takerName: string,
    takerLate: boolean,
  ): Pick<Suggestion<P, I>, "fromWeather" | "toWeather" | "reason"> {
    const [cg, ct] = [capacities[move.from] ?? FULL_TIME, capacities[move.to] ?? FULL_TIME];
    const ratio = (load: number, share: number) => times(ratioOf(load, share));
    const toAfter = move.toLoad + move.size;
    if (move.fromLoad === null) {
      const gone = away[move.from];
      // Their work joins the fair share as the taker takes it on.
      const after = fairShare(
        loads.map((load, i) =>
          i === move.to && load !== null ? load + move.size : away[i] ? null : load,
        ),
        capacities,
      );
      const [before, share] = [shareOf(teamAverage, ct), shareOf(after, ct)];
      const against = ct === FULL_TIME ? "the team average" : "their share";
      // With nothing urgent among those present, there's no share to compare with before.
      const taker = !share
        ? `${takerName} takes it on`
        : !before
          ? `${takerName} goes to ${ratio(toAfter, share)} ${against}`
          : `${takerName} goes from ${ratio(move.toLoad, before)} to ${ratio(toAfter, share)} ${against}`;
      return {
        fromWeather: "away",
        toWeather: weatherFor(toAfter, share, takerLate, thresholds),
        reason: `${giverName} is ${gone ? `away until ${shortDate(gone.until)}` : "away"}; ${taker}`,
      };
    }
    // Both were measured before and after, and the fair share depends only on totals, so it
    // doesn't move.
    const average = teamAverage as number;
    const [fromShare, toShare] = [average * cg, average * ct];
    const fromAfter = move.fromLoad - move.size;
    const against = cg === FULL_TIME && ct === FULL_TIME ? "the team average" : "their share";
    return {
      fromWeather: weatherFor(fromAfter, fromShare, overdue[move.from] ?? false, thresholds),
      toWeather: weatherFor(toAfter, toShare, takerLate, thresholds),
      reason: `${giverName} goes from ${ratio(move.fromLoad, fromShare)} to ${ratio(fromAfter, fromShare)} ${against}, ${takerName} from ${ratio(move.toLoad, toShare)} to ${ratio(toAfter, toShare)}`,
    };
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
  /** How much of a full-time week each person works then, their time off taken off. */
  capacities: number[];
  /** Who is away all of it. */
  away: (Away | null)[];
  /** What each person holds that's urgent then. */
  urgent: Set<Placed<I>>[];
  /** What each person could hand over. */
  movable: Set<Placed<I>>[];
}

interface Move<I> {
  issue: Placed<I>;
  size: number;
  from: number;
  to: number;
  /** Null when the giver is away: their load isn't weighed against anyone's. */
  fromLoad: number | null;
  toLoad: number;
}

/**
 * How much less even handing `size` from `giver` to `taker` leaves them: the change in
 * `load² / capacity` summed over both. Below 0 is fairer. With both full time, it's lowest when
 * the move leaves the two closest.
 */
function unevenness(
  size: number,
  giver: { load: number; capacity: number },
  taker: { load: number; capacity: number },
): number {
  return (
    (size * (size - 2 * giver.load)) / giver.capacity +
    (size * (size + 2 * taker.load)) / taker.capacity
  );
}

/**
 * Work held by someone away, else the best handover from the busiest overloaded person (for their
 * capacity) who has one, to the least busy person who can take it. Null if nobody away holds
 * urgent work and nobody is overloaded, or no issue that `fits` evens a pair out.
 */
function bestMove<I extends MatrixIssue>(
  { loads, teamAverage, movable, capacities, away }: Round<I>,
  overdue: boolean[],
  takes: boolean[],
  size: (issue: MatrixIssue) => number,
  fits: (issue: Placed<I>, giver: number, taker: number) => boolean,
  thresholds: WeatherThresholds,
): Move<I> | null {
  const measured = loads.flatMap((load, i) => {
    if (load === null || away[i]) return [];
    const capacity = capacities[i] ?? FULL_TIME;
    return [{ i, load, capacity, perFullTime: load / capacity }];
  });
  // Least busy first; ties go to whoever comes first.
  const takers = measured
    .filter(({ i }) => !overdue[i] && takes[i])
    .sort((a, b) => a.perFullTime - b.perFullTime);

  // Whatever someone away holds, most pressing first.
  for (const [from, held] of movable.entries()) {
    if (!away[from]) continue;
    const pressing = [...held].sort(
      (a, b) => byPriority(a.priority, b.priority) || byDueDate(a.dueDate, b.dueDate),
    );
    for (const issue of pressing) {
      const taker = takers.find(({ i }) => fits(issue, from, i));
      if (taker) {
        return {
          issue,
          size: size(issue),
          from,
          to: taker.i,
          fromLoad: null,
          toLoad: taker.load,
        };
      }
    }
  }

  if (teamAverage === null) return null;
  // Busiest first; ties go to whoever comes first.
  const givers = [...measured]
    .sort((a, b) => b.perFullTime - a.perFullTime)
    .filter(({ load, capacity }) => {
      const kind = weatherFor(load, shareOf(teamAverage, capacity), false, thresholds);
      return kind === "rain" || kind === "storm";
    });

  for (const giver of givers) {
    for (const taker of takers) {
      if (giver.perFullTime <= taker.perFullTime) break;
      const evens = (issue: MatrixIssue) => unevenness(size(issue), giver, taker);
      const [issue] = [...(movable[giver.i] ?? [])]
        .filter((i) => size(i) > 0 && evens(i) < 0 && fits(i, giver.i, taker.i))
        .sort(
          (a, b) =>
            // Evens the two out the most, then work that isn't important, then the least important.
            evens(a) - evens(b) ||
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

/** Soonest due first, undated last. */
function byDueDate(a: CalendarDate | null, b: CalendarDate | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function copy<I>(matrix: Matrix<I>): Matrix<I> {
  return {
    do: [...matrix.do],
    schedule: [...matrix.schedule],
    delegate: [...matrix.delegate],
    drop: [...matrix.drop],
  };
}
