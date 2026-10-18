import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "preact/hooks";
import { Avatar, Card } from "ui";
import { colors, fonts, media, motion, radii, space } from "ui/tokens.stylex";
import { type CalendarDate, type PersonMatrix as Matrix, QUADRANTS, type Quadrant } from "./board";
import { IssueCard } from "./IssueCard";
import { entrance } from "./motion";
import { quadrantFill, quadrantInfo } from "./quadrants";

export interface PersonMatrixProps {
  matrix: Matrix;
  today: CalendarDate;
  /** Whether the issue list under the matrix is open. The board starts with every list shut. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  xstyle?: stylex.StyleXStyles;
}

/**
 * One person's mini Eisenhower matrix: a 2×2 of counts, then their issues by quadrant.
 * Picking a quadrant opens the list narrowed to it; picking it again shows every quadrant.
 */
export function PersonMatrix({
  matrix,
  today,
  expanded,
  onExpandedChange,
  xstyle,
}: PersonMatrixProps) {
  const [only, setOnly] = useState<Quadrant | null>(null);
  const details = useRef<HTMLDetailsElement>(null);
  // Hydration leaves `open` as the DOM has it, so catch up with a list opened before then.
  useEffect(() => {
    if (details.current?.open && !expanded) onExpandedChange(true);
  }, []);
  const pick = (q: Quadrant) => {
    if (!expanded) {
      setOnly(q);
      onExpandedChange(true);
    } else {
      setOnly(only === q ? null : q);
    }
  };
  const name = matrix.assignee?.name ?? "Unassigned";
  const total = matrix.issues.length;
  const shown = QUADRANTS.filter((q) => (only ? q === only : matrix.counts[q] > 0));
  // Counts cards as they render, across quadrants, for the reveal's stagger.
  let revealed = 0;

  return (
    <Card as="article" xstyle={[styles.card, xstyle]}>
      <header {...stylex.props(styles.header)}>
        {matrix.assignee ? (
          <Avatar name={name} src={matrix.assignee.avatarUrl} size={36} />
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
      </header>

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
          open={expanded}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            if (open !== expanded) onExpandedChange(open);
            if (!open) setOnly(null);
          }}
        >
          <summary {...stylex.props(styles.toggle)}>
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
              reveal: the cards drop in one after another, the first few at least. */}
          <div key={`${expanded}-${only}`} {...stylex.props(styles.groups)}>
            {shown.map((q) => (
              <section key={q} aria-label={`${name}: ${quadrantInfo[q].name}`}>
                <h3 {...stylex.props(styles.groupHeading)}>
                  {quadrantInfo[q].name}
                  <span {...stylex.props(styles.groupCount)}>{matrix.counts[q]}</span>
                </h3>
                <ul {...stylex.props(styles.list)}>
                  {matrix.issues
                    .filter((issue) => issue.quadrant === q)
                    .map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        today={today}
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
        </details>
      )}
    </Card>
  );
}

// Opening a list is frequent, so the stagger is tight and stops after a few cards: a long list
// shouldn't keep the PM waiting for its tail.
const CARD_STEP_MS = 20;
const MAX_STAGGERED = 6;

const styles = stylex.create({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    minWidth: 0,
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
