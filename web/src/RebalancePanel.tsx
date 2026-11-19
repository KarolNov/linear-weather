import * as stylex from "@stylexjs/stylex";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Avatar, Button, Card, Icon, VisuallyHidden, WeatherIcon, weatherLabels } from "ui";
import { colors, media, radii, space } from "ui/tokens.stylex";
import {
  describeDay,
  listOf,
  type Person,
  type Rebalance,
  type RunningLate,
  type Suggestion,
  type WeatherKind,
} from "./board";
import { entrance } from "./motion";
import { dot, quadrantDot, quadrantInfo } from "./quadrants";
import { weatherIcon } from "./weather";

export interface RebalancePanelProps extends Rebalance {
  teamName: string;
  /** Who stays in a storm whatever is moved, because their overdue work stays with them. */
  runningLate?: RunningLate[];
  /** Issues whose move hasn't answered yet. */
  pending: ReadonlySet<string>;
  /** A batch of moves (today's, or a week's) is being made, one after another. */
  applying: boolean;
  onReassign: (move: Suggestion) => void;
  /** Makes these moves, in order, once the PM has said yes. */
  onApplyNow: (moves: Suggestion[]) => void;
  onClose: () => void;
}

/**
 * Whether the moves the PM was asked to confirm are still today's plan: the same issues to the
 * same people, in the same order. A move made meanwhile, or a board planned again, changes it.
 */
export function stillPlanned(asked: Suggestion[], planned: Suggestion[]): boolean {
  return (
    asked.length === planned.length &&
    asked.every(
      (move, i) => move.issue.id === planned[i]?.issue.id && move.to.id === planned[i]?.to.id,
    )
  );
}

/** A batch of moves, as the PM is asked to make them: who gets what, in the order they'll be made. */
export function ConfirmMoves({
  moves,
  onConfirm,
  onCancel,
}: {
  moves: Suggestion[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // The button that opened it is gone, so the keyboard goes to the question.
  const question = useRef<HTMLParagraphElement>(null);
  useEffect(() => question.current?.focus(), []);
  return (
    <section aria-labelledby="confirm-moves" {...stylex.props(styles.confirm)}>
      <p id="confirm-moves" ref={question} tabIndex={-1} {...stylex.props(styles.confirmQuestion)}>
        Make {moves.length === 1 ? "this move" : `these ${moves.length} moves`} in Linear?
      </p>
      <ol {...stylex.props(styles.confirmList)}>
        {moves.map(({ issue, from, to }) => (
          <li key={issue.id} {...stylex.props(styles.confirmLine)}>
            <span {...stylex.props(styles.identifier)}>{issue.identifier}</span>
            <VisuallyHidden>from</VisuallyHidden>
            <Who person={from} />
            <Icon name="arrowRight" size={14} xstyle={styles.arrow} />
            <VisuallyHidden>to</VisuallyHidden>
            <Who person={to} />
          </li>
        ))}
      </ol>
      <p {...stylex.props(styles.fine)}>
        One at a time, in this order. If one fails, the rest wait, and the board plans again from
        wherever things stand.
      </p>
      <div {...stylex.props(styles.actions)}>
        <Button variant="primary" icon="check" onClick={onConfirm}>
          Make {moves.length === 1 ? "it" : "them"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

/**
 * Who could hand which issue to whom: for today's storms, and for the ones the forecast sees
 * coming. Each move is made in Linear in one click; today's can be made all at once, after a yes.
 * The forecast plans each week as if today's moves and the weeks before it were made, so a
 * week's moves can be made all at once only when it's the first left and today's are done.
 *
 * On a wide screen the board docks it beside the people, so it's built narrow: each move is a
 * compact card reading giver → taker, with each one's load before → after.
 */
export function RebalancePanel({
  teamName,
  rebalanceNow,
  rebalanceForecast,
  runningLate = [],
  pending,
  applying,
  onReassign,
  onApplyNow,
  onClose,
}: RebalancePanelProps) {
  // The batch as it stood when the PM asked to make it all (today's, or the first week's), while
  // they're asked to confirm.
  const [confirming, setConfirming] = useState<Batch | null>(null);
  // The first week ahead can go in one batch only once today's moves are made: it assumes them.
  const [nextWeek, nextWeekMoves = []] =
    rebalanceNow.length === 0 ? (weeksOf(rebalanceForecast)[0] ?? []) : [];
  const planned = (batch: Batch) => (batch.week === null ? rebalanceNow : nextWeekMoves);
  // Only while it's still the plan: a move made meanwhile closes the question.
  const asked =
    confirming &&
    (confirming.week === null || confirming.week === nextWeek) &&
    stillPlanned(confirming.moves, planned(confirming))
      ? confirming
      : null;
  // Which batch is being made, for its button to say so.
  const [making, setMaking] = useState<Batch | null>(null);
  // A week's batch being made keeps its button, busy, until it's done, even once the forecast,
  // planned again after each move, has fewer than two of its moves left, or none.
  const running = applying && making !== null && making.week !== null ? making : null;
  const runningWeekLeft =
    running !== null && rebalanceForecast.some((m) => m.week === running.week);
  // Cancelling gives the keyboard back to the button that asked.
  const [cancelled, setCancelled] = useState(false);
  useEffect(() => {
    if (!cancelled) return;
    setCancelled(false);
    document.querySelector<HTMLElement>("[data-apply-now]")?.focus();
  }, [cancelled]);
  const [explained, setExplained] = useState(false);
  const busy = (move: Suggestion) => applying || pending.has(move.issue.id);
  /** The button that makes a batch, or the question that confirms it once pressed. */
  const batchAction = (batch: Batch) =>
    asked && asked.week === batch.week ? (
      <ConfirmMoves
        moves={asked.moves}
        onConfirm={() => {
          setMaking(asked);
          onApplyNow(asked.moves);
          setConfirming(null);
        }}
        onCancel={() => {
          setConfirming(null);
          setCancelled(true);
        }}
      />
    ) : (
      <Button
        variant={batch.week === null ? "primary" : "secondary"}
        icon={batch.week === null ? undefined : "check"}
        data-apply-now
        disabled={applying || batch.moves.some(busy)}
        aria-busy={(applying && making?.week === batch.week) || undefined}
        onClick={() => setConfirming(batch)}
        xstyle={styles.applyAll}
      >
        {applying && making?.week === batch.week
          ? `Making ${batchName(batch.week)} moves…`
          : batch.week === null
            ? "Make all of today's moves"
            : `Make all ${batch.moves.length} of ${batchName(batch.week)} moves`}
      </Button>
    );
  const moves = rebalanceNow.length + rebalanceForecast.length > 0;
  const late = listOf(
    runningLate.map(({ person, overdue }) => `${person.name} (${overdue} overdue)`),
  );
  return (
    <Card as="section" xstyle={[styles.card, entrance.panel]}>
      <header {...stylex.props(styles.header)}>
        <span aria-hidden="true" {...stylex.props(styles.badge)}>
          <Icon name="balance" size={14} />
        </span>
        <h2 id="rebalance-heading" tabIndex={-1} {...stylex.props(styles.heading)}>
          Rebalancing {teamName}
        </h2>
        <Button size="sm" variant="ghost" icon="close" onClick={onClose} xstyle={styles.close}>
          Close
        </Button>
      </header>
      <div {...stylex.props(styles.scroll)}>
        <details
          onToggle={(event) => setExplained(event.currentTarget.open)}
          {...stylex.props(styles.how)}
        >
          <summary {...stylex.props(styles.howToggle)}>
            <Icon
              name="chevronRight"
              size={14}
              xstyle={[styles.howChevron, explained && styles.howChevronOpen]}
            />
            How moves are picked
          </summary>
          <p {...stylex.props(styles.fine, styles.howText)}>
            Anyone away hands on their urgent work first. Then the busiest person hands the least
            busy one issue at a time, until nobody is under rain or in a storm. Otherwise overdue
            work stays where it is, and nobody running late or away takes more. Loads read as a
            multiple of each person's fair share: 1.0× is the team average.
          </p>
        </details>
        {runningLate.length > 0 && (
          <div {...stylex.props(styles.note)}>
            <WeatherIcon weather="storm" size={18} label="" />
            <p>
              {late} {runningLate.length === 1 ? "stays" : "stay"} in a storm
              {moves ? " after these moves" : ""}: overdue work stays with whoever has it. Finish
              it, or move its due date in Linear, to clear the storm.
            </p>
          </div>
        )}
        <Horizon
          id="rebalance-now"
          title="Now"
          lead="Urgent work to hand over today."
          empty="Nothing to move: nobody's urgent load is far above the average, or no one move would help."
          suggestions={rebalanceNow}
          busy={busy}
          onReassign={onReassign}
        >
          {rebalanceNow.length > 0 && batchAction({ week: null, moves: rebalanceNow })}
        </Horizon>
        <Horizon
          id="rebalance-forecast"
          title="Before the storm"
          lead="Once today's moves are made: work to hand over before it turns urgent."
          empty="Nothing to move ahead of time: no storm is coming that one move would head off."
          suggestions={rebalanceForecast}
          busy={busy}
          onReassign={onReassign}
          byWeek
          weekAction={(week, weekMoves) =>
            running
              ? week === running.week && batchAction(running)
              : week === nextWeek && weekMoves.length > 1 && batchAction({ week, moves: weekMoves })
          }
        >
          {running && !runningWeekLeft && batchAction(running)}
        </Horizon>
      </div>
    </Card>
  );
}

function Horizon({
  id,
  title,
  lead,
  empty,
  suggestions,
  busy,
  onReassign,
  byWeek,
  weekAction,
  children,
}: {
  id: string;
  title: string;
  lead: string;
  empty: string;
  suggestions: Suggestion[];
  busy: (move: Suggestion) => boolean;
  onReassign: (move: Suggestion) => void;
  /** Splits the moves into the weeks whose storm they head off. */
  byWeek?: boolean;
  /** Anything to do with a whole week's moves, shown above them. */
  weekAction?: (week: number | null, moves: Suggestion[]) => ComponentChildren;
  /** Anything to do with the whole list, shown above it. */
  children?: ComponentChildren;
}) {
  const list = (moves: Suggestion[]) => (
    <ol {...stylex.props(styles.list)}>
      {moves.map((suggestion) => (
        <SuggestionItem
          key={suggestion.issue.id}
          suggestion={suggestion}
          busy={busy(suggestion)}
          onReassign={() => onReassign(suggestion)}
        />
      ))}
    </ol>
  );
  return (
    <section aria-labelledby={id} {...stylex.props(styles.horizon)}>
      <div>
        <h3 id={id} {...stylex.props(styles.subheading)}>
          {title}
          {suggestions.length > 0 && (
            <span {...stylex.props(styles.tally)}>
              <VisuallyHidden>: </VisuallyHidden>
              {suggestions.length}
              <VisuallyHidden>{suggestions.length === 1 ? " move" : " moves"}</VisuallyHidden>
            </span>
          )}
        </h3>
        <p {...stylex.props(styles.fine)}>{lead}</p>
      </div>
      {children}
      {suggestions.length === 0 ? (
        <p {...stylex.props(styles.empty)}>
          <WeatherIcon weather="sun" size={16} label="" />
          {empty}
        </p>
      ) : byWeek ? (
        weeksOf(suggestions).map(([week, moves]) => (
          <section key={week ?? "now"} aria-label={weekName(week)} {...stylex.props(styles.week)}>
            <h4 aria-hidden="true" {...stylex.props(styles.weekHeading)}>
              {weekName(week)}
            </h4>
            {weekAction?.(week, moves)}
            {list(moves)}
          </section>
        ))
      ) : (
        list(suggestions)
      )}
    </section>
  );
}

/** Moves to make together after one yes: today's (`week` null), or a week's ahead. */
interface Batch {
  week: number | null;
  moves: Suggestion[];
}

/** E.g. "today's", "this week's" or "week 3's". */
function batchName(week: number | null): string {
  return week === null ? "today's" : week === 1 ? "this week's" : `week ${week}'s`;
}

/** A forecast week's heading; a move with no week is one for today. */
const weekName = (week: number | null) =>
  week === null ? "Now" : week === 1 ? "This week" : `Week ${week}`;

/** The moves in the order they came, gathered by week. */
function weeksOf(moves: Suggestion[]): [number | null, Suggestion[]][] {
  const weeks = new Map<number | null, Suggestion[]>();
  for (const move of moves) {
    const week = move.week;
    weeks.set(week, [...(weeks.get(week) ?? []), move]);
  }
  return [...weeks];
}

function SuggestionItem({
  suggestion: { issue, from, to, week, fromWeather, toWeather, fromLoad, toLoad, reason },
  busy,
  onReassign,
}: {
  suggestion: Suggestion;
  /** Its move, or every move, is being made. */
  busy: boolean;
  onReassign: () => void;
}) {
  const quadrant = issue.quadrant.toLowerCase() as keyof typeof quadrantInfo;
  const when = week === null ? "now" : `in week ${week}`;
  return (
    <li aria-busy={busy || undefined} {...stylex.props(styles.item, busy && styles.busy)}>
      <div {...stylex.props(styles.itemMeta)}>
        <span {...stylex.props(styles.quadrant)}>
          <span aria-hidden="true" {...stylex.props(dot.dot, quadrantDot[quadrant])} />
          {quadrantInfo[quadrant].name}
        </span>
        <a href={issue.url} target="_blank" rel="noreferrer" {...stylex.props(styles.identifier)}>
          {issue.identifier}
        </a>
        {week !== null && issue.becomesUrgentOn && (
          <span {...stylex.props(styles.fine)}>urgent {describeDay(issue.becomesUrgentOn)}</span>
        )}
      </div>
      <p {...stylex.props(styles.title)} title={issue.title}>
        {issue.title}
      </p>
      <Button
        size="sm"
        iconEnd="arrowRight"
        disabled={busy}
        aria-label={`${busy ? "Handing" : "Hand"} ${issue.identifier} to ${to.name}${busy ? "…" : ""}`}
        data-reassign={issue.id}
        onClick={onReassign}
        xstyle={styles.handOver}
      >
        {busy ? "Handing…" : "Hand over"}
      </Button>
      <div {...stylex.props(styles.transfer)}>
        <VisuallyHidden>Move from</VisuallyHidden>
        <Side person={from} load={fromLoad} weather={fromWeather} when={when} />
        <span aria-hidden="true" {...stylex.props(styles.transferArrow)}>
          <Icon name="arrowRight" size={14} />
        </span>
        <VisuallyHidden>to</VisuallyHidden>
        <Side person={to} load={toLoad} weather={toWeather} when={when} />
      </div>
      <p {...stylex.props(styles.fine, styles.reason)}>{reason}</p>
    </li>
  );
}

/** One end of a move: who, and their load before → after, with the weather it leaves them in. */
function Side({
  person,
  load,
  weather,
  when,
}: {
  person: Person;
  load: Suggestion["toLoad"];
  weather: WeatherKind;
  when: string;
}) {
  const icon = weatherIcon[weather];
  return (
    <span {...stylex.props(styles.side)}>
      {/* The weather it leaves them in sits on their avatar, like a status. */}
      <span {...stylex.props(styles.face)}>
        <Avatar name={person.name} src={person.avatarUrl} size={24} />
        <span {...stylex.props(styles.faceWeather)}>
          <WeatherIcon
            weather={icon}
            size={14}
            label={`${person.name} would be: ${weatherLabels[icon]} ${when}.`}
          />
        </span>
      </span>
      <span {...stylex.props(styles.sideText)}>
        <span {...stylex.props(styles.sideName)}>{person.name}</span>
        <span {...stylex.props(styles.load)}>
          {load ? (
            <>
              {load.before !== null && (
                <>
                  {times(load.before)}
                  <span aria-hidden="true" {...stylex.props(styles.loadArrow)}>
                    →
                  </span>
                  <VisuallyHidden> to </VisuallyHidden>
                </>
              )}
              <strong {...stylex.props(styles.loadAfter)}>{times(load.after)}</strong>
            </>
          ) : weather === "AWAY" ? (
            "away"
          ) : null}
        </span>
      </span>
    </span>
  );
}

/** A load as a multiple of a fair share, e.g. "2.5×". */
const times = (ratio: number) => `${Number.isInteger(ratio) ? ratio.toFixed(1) : ratio}×`;

function Who({ person }: { person: Person }) {
  return (
    <span {...stylex.props(styles.who)}>
      <Avatar name={person.name} src={person.avatarUrl} size={20} />
      {person.name}
    </span>
  );
}

const styles = stylex.create({
  // Docked, it fills the dock's height and scrolls inside, keeping its header in view.
  card: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    padding: 0,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    height: "44px",
    paddingInlineStart: space.md,
    paddingInlineEnd: "6px",
    borderBottom: `1px solid ${colors.border}`,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    flexShrink: 0,
    borderRadius: radii.sm,
    color: colors.onSelected,
    backgroundColor: colors.selected,
  },
  heading: {
    flexGrow: 1,
    minWidth: 0,
    fontSize: "0.8125rem",
    fontWeight: 600,
    outline: "none",
  },
  close: { flexShrink: 0 },
  scroll: {
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: space.md,
  },
  how: { marginBlock: `calc(-1 * ${space.xxs})` },
  howToggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xxs,
    paddingBlock: space.xxs,
    paddingInline: "6px",
    marginInlineStart: "-6px",
    borderRadius: radii.sm,
    color: colors.inkMuted,
    fontSize: "0.75rem",
    fontWeight: 500,
    cursor: "pointer",
    listStyle: "none",
    "::-webkit-details-marker": { display: "none" },
    backgroundColor: {
      default: "transparent",
      [media.hover]: { default: "transparent", ":hover": colors.hover },
    },
    outline: { default: "none", ":focus-visible": `2px solid ${colors.focus}` },
  },
  howChevron: {
    transitionProperty: "transform",
    transitionDuration: "200ms",
    transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
  },
  howChevronOpen: { transform: "rotate(90deg)" },
  howText: { marginTop: space.xxs },
  subheading: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "0.8125rem",
    fontWeight: 600,
  },
  tally: {
    color: colors.inkFaint,
    fontWeight: 500,
    fontVariantNumeric: "tabular-nums",
  },
  fine: { color: colors.inkMuted, fontSize: "0.75rem", lineHeight: 1.5 },
  note: {
    display: "flex",
    alignItems: "flex-start",
    gap: space.xs,
    paddingBlock: space.xs,
    paddingInline: "10px",
    borderRadius: radii.md,
    color: colors.inkMuted,
    backgroundColor: colors.subtle,
    boxShadow: `inset 0 0 0 1px ${colors.border}`,
    fontSize: "0.75rem",
    lineHeight: 1.5,
  },
  horizon: { display: "flex", flexDirection: "column", gap: space.xs, minWidth: 0 },
  applyAll: { width: "100%" },
  empty: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    color: colors.inkMuted,
    fontSize: "0.75rem",
    lineHeight: 1.5,
  },
  week: { display: "flex", flexDirection: "column", gap: "2px", marginTop: space.xxs },
  weekHeading: { fontSize: "0.75rem", fontWeight: 500, color: colors.inkMuted },
  // Rows divided by hairlines, as in a Linear list, rather than cards inside a card.
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
  },
  // Which issue and the button on top, then its title and who to whom across the row.
  item: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    columnGap: space.sm,
    rowGap: "4px",
    paddingBlock: "10px",
    borderTop: `1px solid ${colors.border}`,
    minWidth: 0,
    transitionProperty: "opacity",
    transitionDuration: "200ms",
  },
  itemMeta: {
    gridColumn: "1",
    gridRow: "1",
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    minWidth: 0,
  },
  title: {
    gridColumn: "1 / -1",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "0.8125rem",
    fontWeight: 500,
  },
  handOver: { gridColumn: "2", gridRow: "1", alignSelf: "center" },
  identifier: {
    flexShrink: 0,
    fontWeight: 500,
    fontSize: "0.75rem",
    color: colors.inkMuted,
    fontVariantNumeric: "tabular-nums",
    textDecoration: { default: "none", ":hover": "underline" },
    outline: { default: "none", ":focus-visible": `2px solid ${colors.focus}` },
    borderRadius: "4px",
  },
  quadrant: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    flexShrink: 0,
    fontSize: "0.75rem",
    fontWeight: 500,
    color: colors.inkMuted,
  },
  // Two ends with an arrow between, sharing the width evenly whatever the names.
  transfer: {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
    alignItems: "center",
    gap: space.xs,
    paddingTop: "2px",
  },
  reason: { gridColumn: "1 / -1", margin: 0 },
  transferArrow: { display: "inline-flex", color: colors.inkFaint },
  side: { display: "flex", alignItems: "center", gap: space.xs, minWidth: 0 },
  face: { position: "relative", display: "inline-flex", flexShrink: 0 },
  faceWeather: {
    position: "absolute",
    right: "-5px",
    bottom: "-4px",
    display: "inline-flex",
    padding: "1px",
    borderRadius: "50%",
    backgroundColor: colors.surfaceStrong,
    boxShadow: `0 0 0 1px ${colors.border}`,
  },
  sideText: { display: "flex", flexDirection: "column", minWidth: 0 },
  sideName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "0.75rem",
    fontWeight: 500,
  },
  load: {
    display: "inline-flex",
    alignItems: "center",
    gap: "3px",
    fontSize: "0.6875rem",
    color: colors.inkMuted,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  loadArrow: { opacity: 0.6, paddingInline: "1px" },
  loadAfter: { color: colors.ink, fontWeight: 600, marginInlineEnd: "2px" },
  busy: { opacity: 0.5 },
  confirm: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    padding: space.sm,
    borderRadius: radii.md,
    backgroundColor: colors.subtle,
    boxShadow: `inset 0 0 0 1px ${colors.border}`,
  },
  confirmQuestion: { fontSize: "0.8125rem", fontWeight: 600, outline: "none" },
  confirmList: {
    margin: 0,
    paddingInlineStart: space.md,
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
  },
  confirmLine: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px",
    fontSize: "0.75rem",
  },
  arrow: { color: colors.inkFaint },
  who: { display: "inline-flex", alignItems: "center", gap: space.xxs, fontWeight: 500 },
  actions: { display: "flex", flexWrap: "wrap", gap: "6px" },
});
