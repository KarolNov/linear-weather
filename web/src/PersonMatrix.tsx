import * as stylex from "@stylexjs/stylex";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Avatar, Card, VisuallyHidden, WeatherIcon, weatherLabels } from "ui";
import { colors, media, motion, radii, space, weatherTones } from "ui/tokens.stylex";
import {
  type BoardIssue,
  CAPACITIES,
  type CalendarDate,
  total as countIssues,
  describeCapacity,
  describeDay,
  describeWeek,
  type ForecastWeek,
  type PersonMatrix as Person,
  QUADRANTS,
  type Quadrant,
  type TimeOff,
} from "./board";
import { IssueCard } from "./IssueCard";
import { entrance, SETTLE_KEY, useChanged, useSettle } from "./motion";
import { dot, quadrantDot, quadrantInfo } from "./quadrants";
import { TimeOffList } from "./TimeOff";
import { weatherIcon } from "./weather";

export interface PersonMatrixProps {
  person: Person;
  today: CalendarDate;
  /** Whether the issue list under the matrix is open. The board starts with every list shut. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Places an issue by hand, or with null hands it back to the rules. */
  onPlace?: (issue: BoardIssue, quadrant: Quadrant | null) => void;
  /** Sets how much of a full-time week they work. Without it, a capacity is only shown. */
  onCapacityChange?: (factor: number) => void;
  /** Marks them away; resolves to whether it was saved. Without it, time off is only shown. */
  onAddTimeOff?: (startsOn: CalendarDate, endsOn: CalendarDate) => Promise<boolean>;
  onRemoveTimeOff?: (timeOff: TimeOff) => void;
  /** Issues whose move, and people whose capacity or time off, is on its way to the server. */
  pending?: ReadonlySet<string>;
  xstyle?: stylex.StyleXStyles;
}

/**
 * One person's mini Eisenhower matrix: a 2×2 of counts, then their issues by quadrant.
 * Picking a quadrant opens the list narrowed to it; picking it again shows every quadrant.
 */
export function PersonMatrix({
  person: { assignee, capacity, timeOff, matrix, weather, forecast },
  today,
  expanded,
  onExpandedChange,
  onPlace,
  onCapacityChange,
  onAddTimeOff,
  onRemoveTimeOff,
  pending,
  xstyle,
}: PersonMatrixProps) {
  const [only, setOnly] = useState<Quadrant | null>(null);
  // Quadrants whose long list the PM asked to see whole. A list starts cut at `LIST_CAP` cards.
  const [whole, setWhole] = useState<ReadonlySet<Quadrant>>(NO_QUADRANTS);
  const weatherChanged = useChanged(weather?.kind);
  // A quadrant the PM just moved the last issue out of shows every quadrant again, and stays
  // unpicked, so moving an issue back in later doesn't hide the rest.
  if (only !== null && matrix.counts[only] === 0) setOnly(null);
  const details = useRef<HTMLDetailsElement>(null);
  const body = useRef<HTMLDivElement>(null);
  // The <details> stays open while its list slides shut, so `open` lags `expanded` on the way down.
  const [open, setOpen] = useState(expanded);
  const sliding = useRef<Animation | null>(null);
  // Set when there is nothing to slide: the first render, or a list the browser already opened.
  const still = useRef(true);
  useLayoutEffect(() => {
    if (expanded && !open) {
      setOpen(true); // Runs again once the list is in the DOM, to slide it open.
      return;
    }
    const el = body.current;
    if (still.current || !el || !open) {
      still.current = false;
      return;
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (!expanded) setOpen(false);
      return;
    }
    // From wherever it is now: a list reopened mid-slide turns around instead of jumping.
    const midway = sliding.current?.playState === "running";
    const fromHeight = midway ? el.getBoundingClientRect().height : null;
    const fromOpacity = midway ? Number(getComputedStyle(el).opacity) : 1;
    sliding.current?.cancel();
    // The layout height, not scrollHeight, which counts the cards still rising into place.
    const full = el.getBoundingClientRect().height;
    // Opening, the cards fade in on their own; closing, the list fades as it shuts, so the cards
    // aren't sliced off by the bottom edge. Shutting is quicker than opening.
    const animation = el.animate(
      {
        height: [`${fromHeight ?? (expanded ? 0 : full)}px`, `${expanded ? full : 0}px`],
        opacity: [fromOpacity, expanded ? 1 : 0],
        overflow: ["hidden", "hidden"],
      },
      { duration: expanded ? OPEN_MS : CLOSE_MS, easing: SLIDE_EASING },
    );
    sliding.current = animation;
    animation.onfinish = () => {
      sliding.current = null;
      if (!expanded) setOpen(false);
    };
  }, [expanded, open]);
  // Hydration leaves `open` as the DOM has it, so catch up with a list opened before then.
  useEffect(() => {
    if (details.current?.open && !expanded) {
      still.current = true;
      setOpen(true);
      onExpandedChange(true);
    }
  }, []);
  const pick = (q: Quadrant) => {
    if (!expanded) {
      setOnly(q);
      onExpandedChange(true);
    } else {
      setOnly(only === q ? null : q);
    }
  };
  const name = assignee?.name ?? "Unassigned";
  const total = countIssues(matrix);
  const shown = QUADRANTS.filter((q) => (only ? q === only : matrix.counts[q] > 0));
  // A long list shows its first few, so an open card doesn't grow into a page of its own.
  const visible = (q: Quadrant) =>
    whole.has(q) || matrix[q].length <= LIST_CAP ? matrix[q] : matrix[q].slice(0, LIST_CAP);
  const list = useRef<HTMLDivElement>(null);
  // Issues coming and going (a move, a hand-over, Linear's news) settle the list into its new
  // shape rather than jumping to it.
  useSettle(
    list,
    shown.map((q) => `${q}:${visible(q).map((issue) => issue.id)}`).join(" "),
    `${only}`,
    open && expanded,
  );
  // Counts cards as they render, across quadrants, for the reveal's stagger.
  let revealed = 0;

  return (
    <Card as="article" xstyle={[styles.card, xstyle]}>
      <header {...stylex.props(styles.header)}>
        {assignee ? (
          <Avatar name={name} src={assignee.avatarUrl} size={28} />
        ) : (
          <span aria-hidden="true" {...stylex.props(styles.nobody)}>
            ?
          </span>
        )}
        <div {...stylex.props(styles.who)}>
          <h2 {...stylex.props(styles.name)}>{name}</h2>
          <span {...stylex.props(styles.total)}>
            {total === 0 ? "Nothing open" : `${total} open ${total === 1 ? "issue" : "issues"}`}
            {assignee && capacity !== null && (
              <>
                {" · "}
                {onCapacityChange ? (
                  <label>
                    <VisuallyHidden>{`${name}'s capacity`}</VisuallyHidden>
                    <select
                      value={capacity}
                      disabled={pending?.has(assignee.id)}
                      onChange={(event) => {
                        const select = event.currentTarget;
                        onCapacityChange(Number(select.value));
                        // Shows the saved capacity until the answer redraws the board, so a
                        // failed save doesn't leave the pick showing.
                        select.value = String(capacity);
                      }}
                      {...stylex.props(styles.capacity)}
                    >
                      {capacityChoices(capacity).map((factor) => (
                        <option key={factor} value={factor}>
                          {describeCapacity(factor)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  describeCapacity(capacity)
                )}
              </>
            )}
          </span>
        </div>
        {weather && (
          <span
            key={weather.kind}
            title={weather.reason}
            {...stylex.props(styles.weather, weatherChanged && entrance.changed)}
          >
            <WeatherIcon
              weather={weatherIcon[weather.kind]}
              size={28}
              label={`${weatherLabels[weatherIcon[weather.kind]]}: ${weather.reason}`}
            />
          </span>
        )}
      </header>

      {assignee && timeOff && (
        <TimeOffList
          name={name}
          timeOff={timeOff}
          today={today}
          onAdd={onAddTimeOff}
          onRemove={onRemoveTimeOff}
          pending={pending?.has(assignee.id)}
        />
      )}

      {forecast && forecast.length > 0 && <Forecast name={name} weeks={forecast} />}

      <div {...stylex.props(styles.grid)}>
        {QUADRANTS.map((q) => {
          const count = matrix.counts[q];
          return (
            <button
              key={q}
              type="button"
              aria-pressed={expanded && only === q}
              disabled={count === 0}
              onClick={() => pick(q)}
              title={
                expanded && only === q
                  ? "Show all quadrants"
                  : `Show ${name}'s ${quadrantInfo[q].name} issues`
              }
              {...stylex.props(
                styles.cell,
                count === 0 && styles.empty,
                expanded && only !== null && only !== q && styles.dimmed,
                expanded && only === q && styles.picked,
              )}
            >
              <span {...stylex.props(styles.cellName)}>
                <span aria-hidden="true" {...stylex.props(dot.dot, quadrantDot[q])} />
                {quadrantInfo[q].name}
              </span>
              <ChangedCount count={count} />
            </button>
          );
        })}
      </div>

      {total === 0 ? (
        // Holds the toggle's row, so an empty card lines up with its neighbours.
        <div aria-hidden="true" {...stylex.props(styles.toggle, styles.placeholder)}>
          Show issues
        </div>
      ) : (
        // <details> so the toggle works before the page hydrates; afterwards the board owns it.
        <details
          ref={details}
          open={open}
          onToggle={(event) => {
            if (event.currentTarget.open) return;
            setOnly(null);
            setWhole(NO_QUADRANTS);
          }}
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: <summary> is the native toggle. */}
          <summary
            // Before hydration the browser toggles the list; after, the board does, so it can slide.
            onClick={(event) => {
              event.preventDefault();
              onExpandedChange(!expanded);
            }}
            {...stylex.props(styles.toggle)}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              aria-hidden="true"
              {...stylex.props(styles.chevron, expanded && styles.chevronOpen)}
            >
              <path
                d="M4.5 3 7.5 6 4.5 9"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            {expanded ? "Hide issues" : `Show ${total === 1 ? "issue" : `${total} issues`}`}
          </summary>
          {/* Keyed by what's shown, so opening the list or picking a quadrant replays the
              reveal: the cards drop in one after another, the first few at least. Not keyed by
              `expanded`, so the cards hold still while the list slides shut. */}
          <div ref={body} {...stylex.props(styles.slide)}>
            <div ref={list} {...stylex.props(styles.settle)}>
              <div key={`${open}-${only}`} {...stylex.props(styles.groups)}>
                {shown.map((q) => {
                  const cards = visible(q);
                  const hidden = matrix[q].length - cards.length;
                  const label = `${name}'s ${quadrantInfo[q].name} issues`;
                  return (
                    <section key={q} aria-label={`${name}: ${quadrantInfo[q].name}`}>
                      {/* Headings and buttons glide with the cards around them. */}
                      <h3
                        {...{ [SETTLE_KEY]: `heading-${q}` }}
                        {...stylex.props(styles.groupHeading)}
                      >
                        <span aria-hidden="true" {...stylex.props(dot.dot, quadrantDot[q])} />
                        {quadrantInfo[q].name}
                        <span {...stylex.props(styles.groupCount)}>{matrix.counts[q]}</span>
                      </h3>
                      <ul {...stylex.props(styles.list)}>
                        {cards.map((issue) => (
                          <IssueCard
                            key={issue.id}
                            issue={issue}
                            quadrant={q}
                            today={today}
                            onPlace={onPlace && ((to) => onPlace(issue, to))}
                            pending={pending?.has(issue.id)}
                            xstyle={[
                              entrance.reveal,
                              entrance.delay(Math.min(revealed++, MAX_STAGGERED) * CARD_STEP_MS),
                            ]}
                          />
                        ))}
                      </ul>
                      {matrix[q].length > LIST_CAP && (
                        <button
                          type="button"
                          aria-expanded={hidden === 0}
                          onClick={() => setWhole(toggled(whole, q))}
                          {...{ [SETTLE_KEY]: `more-${q}` }}
                          {...stylex.props(styles.more)}
                        >
                          {hidden > 0 ? `Show ${hidden} more` : "Show fewer"}
                          <VisuallyHidden>{` of ${label}`}</VisuallyHidden>
                        </button>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
        </details>
      )}
    </Card>
  );
}

/** The capacities to offer: the board's, plus whatever the server holds if it isn't one of them. */
function capacityChoices(current: number): number[] {
  return CAPACITIES.includes(current) ? CAPACITIES : [...CAPACITIES, current].sort((a, b) => b - a);
}

/**
 * The weeks ahead as a strip of small icons. Each explains itself on hover, and on a press for
 * keyboards, touch and screen readers.
 */
/** A quadrant's count, keyed by its value so a move settles the number it changed into place. */
function ChangedCount({ count }: { count: number }) {
  const changed = useChanged(count);
  return (
    <span key={count} {...stylex.props(styles.count, changed && entrance.changed)}>
      {count}
    </span>
  );
}

function Forecast({ name, weeks }: { name: string; weeks: ForecastWeek[] }) {
  const [picked, setPicked] = useState<CalendarDate | null>(null);
  const explain = ({ endsOn, weather, summary, turningUrgent }: ForecastWeek) => {
    const which = turningUrgent.map((issue) => issue.identifier).join(", ");
    const news = turningUrgent.length === 0 ? "" : ` ${summary}: ${which}.`;
    return `${describeWeek(endsOn)}: ${weatherLabels[weatherIcon[weather.kind]]}. ${weather.reason}.${news}`;
  };
  const shown = weeks.find((week) => week.endsOn === picked);
  return (
    <div>
      <ol aria-label={`${name}'s forecast`} {...stylex.props(styles.forecast)}>
        {weeks.map((week) => {
          const explained = explain(week);
          const icon = weatherIcon[week.weather.kind];
          return (
            <li key={week.endsOn} {...stylex.props(styles.weekItem)}>
              <button
                type="button"
                title={explained}
                aria-label={explained}
                aria-pressed={week.endsOn === picked}
                onClick={() => setPicked(week.endsOn === picked ? null : week.endsOn)}
                {...stylex.props(
                  styles.week,
                  weekTones[icon],
                  week.endsOn === picked && styles.weekPicked,
                )}
              >
                <WeatherIcon weather={icon} size={22} label="" />
                {/* The tile is labelled in full; the date alone is enough to see. */}
                <span {...stylex.props(styles.weekLabel)}>{describeDay(week.endsOn)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" {...stylex.props(styles.weekNews, !shown && styles.weekNewsEmpty)}>
        {shown ? explain(shown) : ""}
      </p>
    </div>
  );
}

/** How many cards a quadrant's list shows before "Show N more". */
export const LIST_CAP = 6;

const NO_QUADRANTS: ReadonlySet<Quadrant> = new Set();

/** The set with `q` added, or taken out if it was there. */
function toggled(set: ReadonlySet<Quadrant>, q: Quadrant): ReadonlySet<Quadrant> {
  const next = new Set(set);
  if (!next.delete(q)) next.add(q);
  return next;
}

// Opening a list is frequent, so the stagger is tight and stops after a few cards: a long list
// shouldn't keep the PM waiting for its tail.
const CARD_STEP_MS = 20;
const MAX_STAGGERED = 6;

// The list's height slides open, and a little faster shut. WAAPI wants the curve itself, not the CSS variable,
// so this is `motion.easeOut` spelled out.
const OPEN_MS = 260;
const CLOSE_MS = 200;
const SLIDE_EASING = "cubic-bezier(0.23, 1, 0.32, 1)";

const styles = stylex.create({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    minWidth: 0,
    // An issue's open menu holds the focus, and lifts the card above its neighbours so they
    // don't cover the menu.
    position: "relative",
    zIndex: { default: null, ":focus-within": 1 },
  },
  header: { display: "flex", alignItems: "center", gap: "10px" },
  nobody: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    flexShrink: 0,
    borderRadius: "50%",
    border: `1px dashed ${colors.borderStrong}`,
    color: colors.inkMuted,
    fontSize: "0.75rem",
    fontWeight: 600,
  },
  who: { display: "flex", flexDirection: "column", minWidth: 0 },
  weather: { display: "inline-flex", flexShrink: 0, marginInlineStart: "auto" },
  forecast: {
    display: "grid",
    gridAutoColumns: "minmax(0, 1fr)",
    gridAutoFlow: "column",
    gap: "4px",
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  weekItem: { minWidth: 0 },
  // Each week a tile in its weather's colour, so the strip reads as a forecast at a glance.
  week: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
    width: "100%",
    paddingTop: "5px",
    paddingBottom: "4px",
    paddingInline: "2px",
    borderWidth: 0,
    borderRadius: radii.sm,
    font: "inherit",
    cursor: "pointer",
    boxShadow: `inset 0 0 0 1px ${colors.border}`,
    transitionProperty: "transform, box-shadow",
    transitionDuration: `${motion.press}, ${motion.hover}`,
    transitionTimingFunction: `${motion.easeOut}, ease`,
    transform: { default: null, ":active": "scale(0.97)" },
    outline: { default: "none", ":focus-visible": `2px solid ${colors.focus}` },
  },
  weekPicked: { boxShadow: `inset 0 0 0 1px ${colors.accent}` },
  weekLabel: { fontSize: "0.6875rem", fontWeight: 500, whiteSpace: "nowrap" },
  weekNews: { marginTop: space.xs, marginBottom: 0, fontSize: "0.75rem", color: colors.inkMuted },
  weekNewsEmpty: { display: "none" },
  name: {
    fontSize: "0.875rem",
    fontWeight: 600,
    lineHeight: 1.3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  total: { fontSize: "0.75rem", color: colors.inkMuted },
  capacity: {
    font: "inherit",
    color: "inherit",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: radii.sm,
    padding: 0,
    cursor: { default: "pointer", ":disabled": "progress" },
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    textDecorationColor: colors.inkFaint,
    textUnderlineOffset: "3px",
    outline: { default: "none", ":focus-visible": `2px solid ${colors.focus}` },
  },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" },
  // A neutral tile: the quadrant's dot carries its colour, the count carries the news.
  cell: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
    paddingBlock: "7px",
    paddingInline: "10px",
    borderRadius: radii.sm,
    borderWidth: 0,
    font: "inherit",
    textAlign: "start",
    color: colors.ink,
    backgroundColor: {
      default: colors.subtle,
      [media.hover]: { default: colors.subtle, ":hover:not(:disabled)": "#eff0f2" },
    },
    boxShadow: `inset 0 0 0 1px ${colors.border}`,
    cursor: { default: "pointer", ":disabled": "default" },
    outline: { default: "none", ":focus-visible": `2px solid ${colors.focus}` },
    outlineOffset: "1px",
    transitionProperty: "opacity, transform, background-color, box-shadow",
    transitionDuration: `${motion.press}, ${motion.press}, ${motion.hover}, ${motion.hover}`,
    transitionTimingFunction: `${motion.easeOut}, ${motion.easeOut}, ease, ease`,
    transform: { default: null, ":active": "scale(0.98)" },
  },
  // Kept in place, quieter: no fill, and a faint count, still above AA for its size.
  empty: { color: colors.inkMuted, backgroundColor: "transparent" },
  dimmed: { opacity: 0.45 },
  picked: { backgroundColor: colors.selected, boxShadow: `inset 0 0 0 1px ${colors.accent}` },
  cellName: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "0.75rem",
    fontWeight: 500,
  },
  count: {
    // A box, so the change tick can move it.
    display: "inline-block",
    fontSize: "0.9375rem",
    fontWeight: 600,
    lineHeight: 1.2,
    fontVariantNumeric: "tabular-nums",
  },
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "fit-content",
    // A comfortable thumb target on touch screens, compact with a mouse.
    minHeight: { default: null, [media.touch]: "44px" },
    paddingBlock: "4px",
    paddingInline: "8px",
    marginInlineStart: "-8px",
    borderRadius: radii.sm,
    fontSize: "0.75rem",
    fontWeight: 500,
    color: colors.inkMuted,
    cursor: "pointer",
    userSelect: "none",
    listStyle: "none",
    "::-webkit-details-marker": { display: "none" },
    backgroundColor: {
      default: "transparent",
      [media.hover]: { default: "transparent", ":hover": colors.hover },
    },
    outline: { default: "none", ":focus-visible": `2px solid ${colors.focus}` },
    transitionProperty: "transform, background-color",
    transitionDuration: "160ms, 200ms",
    transitionTimingFunction: `${motion.easeOut}, ease`,
    transform: { default: null, ":active": "scale(0.97)" },
  },
  chevron: {
    transitionProperty: "transform",
    transitionDuration: "200ms",
    transitionTimingFunction: motion.easeOut,
  },
  chevronOpen: { transform: "rotate(90deg)" },
  placeholder: { visibility: "hidden" },
  // Keeps the list's top margin inside, as it is mid-slide with overflow hidden: otherwise the
  // margin collapses out once the slide ends and the card grows by it in one jump.
  slide: { display: "flow-root" },
  // Holds the cards that just left while they fade out where they were, and keeps the list's
  // margin inside for the same reason as the slide.
  settle: { display: "flow-root", position: "relative" },
  more: {
    display: "flex",
    alignItems: "center",
    width: "fit-content",
    minHeight: { default: null, [media.touch]: "44px" },
    marginTop: "4px",
    marginInlineStart: "-8px",
    paddingBlock: "4px",
    paddingInline: "8px",
    borderWidth: 0,
    borderRadius: radii.sm,
    font: "inherit",
    fontSize: "0.75rem",
    fontWeight: 500,
    color: colors.inkMuted,
    cursor: "pointer",
    backgroundColor: {
      default: "transparent",
      [media.hover]: { default: "transparent", ":hover": colors.hover },
    },
    outline: { default: "none", ":focus-visible": `2px solid ${colors.focus}` },
    transitionProperty: "transform, background-color",
    transitionDuration: `${motion.press}, ${motion.hover}`,
    transitionTimingFunction: `${motion.easeOut}, ease`,
    transform: { default: null, ":active": "scale(0.97)" },
  },
  groups: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    marginTop: space.sm,
  },
  groupHeading: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "6px",
    fontSize: "0.75rem",
    fontWeight: 500,
    color: colors.ink,
  },
  groupCount: { fontVariantNumeric: "tabular-nums", color: colors.inkFaint },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
});

// A forecast week's tile: its weather's fill, with ink that reads on it.
const weekTones = stylex.create({
  sun: { color: weatherTones.sunInk, backgroundColor: weatherTones.sunFill },
  partly: { color: weatherTones.partlyInk, backgroundColor: weatherTones.partlyFill },
  rain: { color: weatherTones.rainInk, backgroundColor: weatherTones.rainFill },
  storm: { color: weatherTones.stormInk, backgroundColor: weatherTones.stormFill },
  fog: { color: weatherTones.fogInk, backgroundColor: weatherTones.fogFill },
  away: { color: weatherTones.awayInk, backgroundColor: weatherTones.awayFill },
});
