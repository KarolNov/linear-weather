import * as stylex from "@stylexjs/stylex";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Avatar, Button, Card, VisuallyHidden, WeatherIcon, weatherLabels } from "ui";
import { colors, fonts, radii, space } from "ui/tokens.stylex";
import {
  describeDay,
  listOf,
  type Person,
  type Rebalance,
  type RunningLate,
  type Suggestion,
} from "./board";
import { entrance } from "./motion";
import { quadrantFill, quadrantInfo } from "./quadrants";
import { weatherIcon } from "./weather";

export interface RebalancePanelProps extends Rebalance {
  teamName: string;
  /** Who stays in a storm whatever is moved, because their overdue work stays with them. */
  runningLate?: RunningLate[];
  /** Issues whose move hasn't answered yet. */
  pending: ReadonlySet<string>;
  /** Today's moves are being made, one after another. */
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

/** Today's moves, as the PM is asked to make them: who gets what, in the order they'll be made. */
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
      <p id="confirm-moves" ref={question} tabIndex={-1} {...stylex.props(styles.subheading)}>
        Make {moves.length === 1 ? "this move" : `these ${moves.length} moves`} in Linear?
      </p>
      <ol {...stylex.props(styles.confirmList)}>
        {moves.map(({ issue, from, to }) => (
          <li key={issue.id} {...stylex.props(styles.moveLine)}>
            <span {...stylex.props(styles.identifier)}>{issue.identifier}</span>
            <VisuallyHidden>from</VisuallyHidden>
            <Who person={from} />
            <span aria-hidden="true" {...stylex.props(styles.arrow)}>
              →
            </span>
            <VisuallyHidden>to</VisuallyHidden>
            <Who person={to} />
          </li>
        ))}
      </ol>
      <p {...stylex.props(styles.muted)}>
        One at a time, in this order. If one fails, the rest wait, and the board plans again from
        wherever things stand.
      </p>
      <div {...stylex.props(styles.actions)}>
        <Button onClick={onConfirm}>Make {moves.length === 1 ? "it" : "them"}</Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

/**
 * Who could hand which issue to whom: for today's storms, and for the ones the forecast sees
 * coming. Each move is made in Linear in one click; today's can be made all at once, after a yes.
 * The ones ahead stay one at a time: they hand over work that isn't urgent yet, and assume
 * today's moves were made.
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
  // Today's moves as they stood when the PM asked to make them all, while they're asked to confirm.
  const [confirming, setConfirming] = useState<Suggestion[] | null>(null);
  // Only while they're still the plan: a move made meanwhile closes the question.
  const asked = confirming && stillPlanned(confirming, rebalanceNow) ? confirming : null;
  // Cancelling gives the keyboard back to the button that asked.
  const [cancelled, setCancelled] = useState(false);
  useEffect(() => {
    if (!cancelled) return;
    setCancelled(false);
    document.querySelector<HTMLElement>("[data-apply-now]")?.focus();
  }, [cancelled]);
  const busy = (move: Suggestion) => applying || pending.has(move.issue.id);
  const moves = rebalanceNow.length + rebalanceForecast.length > 0;
  const late = listOf(
    runningLate.map(({ person, overdue }) => `${person.name} (${overdue} overdue)`),
  );
  return (
    <Card as="section" xstyle={entrance.reveal}>
      <div {...stylex.props(styles.panel)}>
        <div>
          <h2 id="rebalance-heading" tabIndex={-1} {...stylex.props(styles.heading)}>
            Rebalancing {teamName}
          </h2>
          <p {...stylex.props(styles.muted)}>
            Anyone away hands on their urgent work first. Then the busiest person hands the least
            busy one issue at a time, until nobody is under rain or in a storm. Otherwise overdue
            work stays where it is, and nobody running late or away takes more.
          </p>
        </div>
        {runningLate.length > 0 && (
          <div {...stylex.props(styles.note)}>
            <WeatherIcon weather="storm" size={28} label="" />
            <p>
              {late} {runningLate.length === 1 ? "stays" : "stay"} in a storm
              {moves ? " after these moves" : ""}: overdue work stays with whoever has it. Finish
              it, or move its due date in Linear, to clear the storm.
            </p>
          </div>
        )}
        <div {...stylex.props(styles.horizons)}>
          <Horizon
            id="rebalance-now"
            title="Now"
            lead="Urgent work to hand over today."
            empty="Nothing to move: nobody's urgent load is far above the average, or no one move would help."
            suggestions={rebalanceNow}
            busy={busy}
            onReassign={onReassign}
          >
            {rebalanceNow.length > 0 &&
              (asked ? (
                <ConfirmMoves
                  moves={asked}
                  onConfirm={() => {
                    onApplyNow(asked);
                    setConfirming(null);
                  }}
                  onCancel={() => {
                    setConfirming(null);
                    setCancelled(true);
                  }}
                />
              ) : (
                <div>
                  <Button
                    data-apply-now
                    disabled={applying || rebalanceNow.some(busy)}
                    aria-busy={applying || undefined}
                    onClick={() => setConfirming(rebalanceNow)}
                  >
                    {applying ? "Making today's moves…" : "Make all of today's moves"}
                  </Button>
                </div>
              ))}
          </Horizon>
          <Horizon
            id="rebalance-forecast"
            title="Before the storm"
            lead="Once today's moves are made: work to hand over before it turns urgent, week by week."
            empty="Nothing to move ahead of time: no storm is coming that one move would head off."
            suggestions={rebalanceForecast}
            busy={busy}
            onReassign={onReassign}
          />
        </div>
        <div>
          <Button variant="quiet" onClick={onClose}>
            Close
          </Button>
        </div>
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
  children,
}: {
  id: string;
  title: string;
  lead: string;
  empty: string;
  suggestions: Suggestion[];
  busy: (move: Suggestion) => boolean;
  onReassign: (move: Suggestion) => void;
  /** Anything to do with the whole list, shown above it. */
  children?: ComponentChildren;
}) {
  return (
    <section aria-labelledby={id} {...stylex.props(styles.horizon)}>
      <div>
        <h3 id={id} {...stylex.props(styles.subheading)}>
          {title}
        </h3>
        <p {...stylex.props(styles.muted)}>{lead}</p>
      </div>
      {children}
      {suggestions.length === 0 ? (
        <p {...stylex.props(styles.empty)}>{empty}</p>
      ) : (
        <ol {...stylex.props(styles.list)}>
          {suggestions.map((suggestion) => (
            <SuggestionItem
              key={suggestion.issue.id}
              suggestion={suggestion}
              busy={busy(suggestion)}
              onReassign={() => onReassign(suggestion)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function SuggestionItem({
  suggestion: { issue, from, to, week, toWeather, reason },
  busy,
  onReassign,
}: {
  suggestion: Suggestion;
  /** Its move, or every move, is being made. */
  busy: boolean;
  onReassign: () => void;
}) {
  const quadrant = issue.quadrant.toLowerCase() as keyof typeof quadrantInfo;
  const icon = weatherIcon[toWeather];
  const when = week === null ? "now" : `in week ${week}`;
  return (
    <li aria-busy={busy || undefined} {...stylex.props(styles.item, busy && styles.busy)}>
      <div {...stylex.props(styles.issueLine)}>
        <a href={issue.url} target="_blank" rel="noreferrer" {...stylex.props(styles.identifier)}>
          {issue.identifier}
        </a>
        <span {...stylex.props(styles.title)} title={issue.title}>
          {issue.title}
        </span>
      </div>
      <div {...stylex.props(styles.moveLine)}>
        <span {...stylex.props(styles.quadrant, quadrantFill[quadrant])}>
          {quadrantInfo[quadrant].name}
        </span>
        {week !== null && issue.becomesUrgentOn && (
          <span {...stylex.props(styles.muted)}>urgent {describeDay(issue.becomesUrgentOn)}</span>
        )}
      </div>
      <div {...stylex.props(styles.moveLine)}>
        <VisuallyHidden>Move from</VisuallyHidden>
        <Who person={from} />
        <span aria-hidden="true" {...stylex.props(styles.arrow)}>
          →
        </span>
        <VisuallyHidden>to</VisuallyHidden>
        <Who person={to} />
        <span {...stylex.props(styles.after)}>
          <WeatherIcon
            weather={icon}
            size={22}
            label={`${to.name} would be: ${weatherLabels[icon]} ${when}.`}
          />
          <span aria-hidden="true">{when}</span>
        </span>
      </div>
      <p {...stylex.props(styles.reason)}>{reason}</p>
      <div>
        <Button
          variant="quiet"
          disabled={busy}
          aria-label={`Hand ${issue.identifier} to ${to.name}`}
          data-reassign={issue.id}
          onClick={onReassign}
          xstyle={styles.reassign}
        >
          Hand over
        </Button>
      </div>
    </li>
  );
}

function Who({ person }: { person: Person }) {
  return (
    <span {...stylex.props(styles.who)}>
      <Avatar name={person.name} src={person.avatarUrl} size={22} />
      {person.name}
    </span>
  );
}

const styles = stylex.create({
  panel: { display: "flex", flexDirection: "column", gap: space.lg },
  heading: {
    fontFamily: fonts.display,
    fontSize: "1.125rem",
    fontWeight: 700,
    marginBottom: space.xxs,
  },
  subheading: { fontFamily: fonts.display, fontSize: "1rem", fontWeight: 700 },
  muted: { color: colors.inkMuted, fontSize: "0.9375rem" },
  note: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    padding: space.sm,
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surfaceStrong,
    fontSize: "0.9375rem",
    lineHeight: 1.4,
  },
  horizons: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
    gap: space.lg,
    alignItems: "start",
  },
  horizon: { display: "flex", flexDirection: "column", gap: space.sm, minWidth: 0 },
  empty: {
    padding: space.md,
    borderRadius: radii.md,
    border: `1px dashed ${colors.border}`,
    color: colors.inkMuted,
    fontSize: "0.9375rem",
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
  },
  item: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
    padding: space.sm,
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surfaceStrong,
    minWidth: 0,
  },
  issueLine: { display: "flex", alignItems: "baseline", gap: space.xs, minWidth: 0 },
  identifier: {
    flexShrink: 0,
    fontWeight: 700,
    fontSize: "0.875rem",
    color: colors.ink,
    textDecoration: { default: "none", ":hover": "underline" },
  },
  title: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "0.9375rem",
  },
  moveLine: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.xs,
    fontSize: "0.875rem",
  },
  quadrant: {
    paddingInline: space.xs,
    paddingBlock: "1px",
    borderRadius: radii.pill,
    fontSize: "0.75rem",
    fontWeight: 700,
  },
  who: { display: "inline-flex", alignItems: "center", gap: space.xxs, fontWeight: 600 },
  arrow: { color: colors.inkMuted },
  after: { display: "inline-flex", alignItems: "center", gap: space.xxs, color: colors.inkMuted },
  reason: { fontSize: "0.8125rem", color: colors.inkMuted, lineHeight: 1.4 },
  busy: { opacity: 0.6 },
  reassign: { paddingBlock: "6px", fontSize: "0.875rem" },
  confirm: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    padding: space.sm,
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surfaceStrong,
  },
  confirmList: {
    margin: 0,
    paddingInlineStart: space.lg,
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
  },
  actions: { display: "flex", flexWrap: "wrap", gap: space.xs },
});
