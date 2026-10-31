import * as stylex from "@stylexjs/stylex";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Avatar, Card, WeatherIcon, weatherLabels } from "ui";
import { colors, fonts, media, motion, radii, space } from "ui/tokens.stylex";
import {
  type BoardIssue,
  type CalendarDate,
  total as countIssues,
  describeWeek,
  type ForecastWeek,
  type PersonMatrix as Person,
  QUADRANTS,
  type Quadrant,
} from "./board";
import { IssueCard } from "./IssueCard";
import { entrance } from "./motion";
import { quadrantFill, quadrantInfo } from "./quadrants";
import { weatherIcon } from "./weather";

export interface PersonMatrixProps {
  person: Person;
  today: CalendarDate;
  /** Whether the issue list under the matrix is open. The board starts with every list shut. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Places an issue by hand, or with null hands it back to the rules. */
  onPlace?: (issue: BoardIssue, quadrant: Quadrant | null) => void;
  /** Issues whose move is on its way to the server. */
  pending?: ReadonlySet<string>;
  xstyle?: stylex.StyleXStyles;
}

/**
 * One person's mini Eisenhower matrix: a 2×2 of counts, then their issues by quadrant.
 * Picking a quadrant opens the list narrowed to it; picking it again shows every quadrant.
 */
export function PersonMatrix({
  person: { assignee, matrix, weather, forecast },
  today,
  expanded,
  onExpandedChange,
  onPlace,
  pending,
  xstyle,
}: PersonMatrixProps) {
  const [only, setOnly] = useState<Quadrant | null>(null);
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
  // Counts cards as they render, across quadrants, for the reveal's stagger.
  let revealed = 0;

  return (
    <Card as="article" xstyle={[styles.card, xstyle]}>
      <header {...stylex.props(styles.header)}>
        {assignee ? (
          <Avatar name={name} src={assignee.avatarUrl} size={36} />
        ) : (
          <span aria-hidden="true" {...stylex.props(styles.nobody)}>
            ?
          </span>
        )}
        <div {...stylex.props(styles.who)}>
          <h2 {...stylex.props(styles.name)}>{name}</h2>
          <span {...stylex.props(styles.total)}>
            {total === 0 ? "Nothing open" : `${total} open ${total === 1 ? "issue" : "issues"}`}
          </span>
        </div>
        {weather && (
          <span title={weather.reason} {...stylex.props(styles.weather)}>
            <WeatherIcon
              weather={weatherIcon[weather.kind]}
              size={36}
              label={`${weatherLabels[weatherIcon[weather.kind]]}: ${weather.reason}`}
            />
          </span>
        )}
      </header>

      {forecast && <Forecast name={name} weeks={forecast} today={today} />}

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
                quadrantFill[q],
                count === 0 && styles.empty,
                expanded && only !== null && only !== q && styles.dimmed,
                expanded && only === q && styles.picked,
              )}
            >
              <span {...stylex.props(styles.cellName)}>{quadrantInfo[q].name}</span>
              <span {...stylex.props(styles.count)}>{count}</span>
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
            if (!event.currentTarget.open) setOnly(null);
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
            <div key={`${open}-${only}`} {...stylex.props(styles.groups)}>
              {shown.map((q) => (
                <section key={q} aria-label={`${name}: ${quadrantInfo[q].name}`}>
                  <h3 {...stylex.props(styles.groupHeading)}>
                    {quadrantInfo[q].name}
                    <span {...stylex.props(styles.groupCount)}>{matrix.counts[q]}</span>
                  </h3>
                  <ul {...stylex.props(styles.list)}>
                    {matrix[q].map((issue) => (
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
                </section>
              ))}
            </div>
          </div>
        </details>
      )}
    </Card>
  );
}

/** The weeks ahead as a strip of small icons, each explained on hover and to screen readers. */
function Forecast({
  name,
  weeks,
  today,
}: {
  name: string;
  weeks: ForecastWeek[];
  today: CalendarDate;
}) {
  return (
    <ol aria-label={`${name}'s forecast`} {...stylex.props(styles.forecast)}>
      {weeks.map(({ startsOn, weather, summary, turningUrgent }) => {
        const when = describeWeek(startsOn, today);
        const which = turningUrgent.map((issue) => issue.identifier).join(", ");
        const news = turningUrgent.length === 0 ? "" : ` ${summary}: ${which}.`;
        const explained = `${when}: ${weatherLabels[weatherIcon[weather.kind]]}. ${weather.reason}.${news}`;
        return (
          <li key={startsOn} title={explained} {...stylex.props(styles.week)}>
            <WeatherIcon weather={weatherIcon[weather.kind]} size={22} label={explained} />
            <span aria-hidden="true" {...stylex.props(styles.weekLabel)}>
              {when}
            </span>
          </li>
        );
      })}
    </ol>
  );
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
    gap: space.md,
    minWidth: 0,
    // An issue's open menu holds the focus, and lifts the card above its neighbours so they
    // don't cover the menu.
    position: "relative",
    zIndex: { default: null, ":focus-within": 1 },
  },
  header: { display: "flex", alignItems: "center", gap: space.sm },
  nobody: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    flexShrink: 0,
    borderRadius: "50%",
    border: `1.5px dashed ${colors.fog}`,
    color: colors.inkMuted,
    fontWeight: 700,
  },
  who: { display: "flex", flexDirection: "column", minWidth: 0 },
  weather: { display: "inline-flex", flexShrink: 0, marginInlineStart: "auto" },
  forecast: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))",
    gridAutoFlow: "column",
    gap: space.xs,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  week: { display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", minWidth: 0 },
  weekLabel: { fontSize: "0.6875rem", color: colors.inkMuted, whiteSpace: "nowrap" },
  name: {
    fontFamily: fonts.display,
    fontSize: "1.0625rem",
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  total: { fontSize: "0.8125rem", color: colors.inkMuted },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" },
  cell: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.xs,
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderRadius: radii.sm,
    borderWidth: 0,
    font: "inherit",
    textAlign: "start",
    cursor: { default: "pointer", ":disabled": "default" },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focus}` },
    outlineOffset: "2px",
    transitionProperty: "opacity, transform, box-shadow",
    transitionDuration: "160ms",
    transitionTimingFunction: motion.easeOut,
    transform: { default: null, ":active": "scale(0.97)" },
    opacity: { default: 1, [media.hover]: { default: 1, ":hover": 0.92 } },
  },
  // Kept in place but faded, so every person's grid reads the same at a glance.
  empty: { opacity: 0.45 },
  dimmed: { opacity: 0.4 },
  picked: { boxShadow: `0 0 0 2px ${colors.surfaceStrong}, 0 0 0 4px ${colors.ink}` },
  cellName: { fontSize: "0.8125rem", fontWeight: 700 },
  count: {
    fontFamily: fonts.display,
    fontSize: "1.375rem",
    fontWeight: 800,
    lineHeight: 1.1,
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
    borderRadius: radii.pill,
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: colors.inkMuted,
    cursor: "pointer",
    userSelect: "none",
    listStyle: "none",
    "::-webkit-details-marker": { display: "none" },
    backgroundColor: {
      default: "transparent",
      [media.hover]: { default: "transparent", ":hover": "rgba(29, 26, 51, 0.06)" },
    },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focus}` },
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
  groups: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    marginTop: space.sm,
  },
  groupHeading: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    marginBottom: space.xs,
    fontSize: "0.75rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: colors.inkMuted,
  },
  groupCount: { fontVariantNumeric: "tabular-nums", opacity: 0.7 },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
  },
});
