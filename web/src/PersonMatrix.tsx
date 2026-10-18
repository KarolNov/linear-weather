import * as stylex from "@stylexjs/stylex";
import { useState } from "preact/hooks";
import { Avatar, Card } from "ui";
import { colors, fonts, motion, radii, space } from "ui/tokens.stylex";
import { type CalendarDate, type PersonMatrix as Matrix, QUADRANTS, type Quadrant } from "./board";
import { IssueCard } from "./IssueCard";
import { quadrantFill, quadrantInfo } from "./quadrants";

export interface PersonMatrixProps {
  matrix: Matrix;
  today: CalendarDate;
  /** Whether the issue list under the matrix is open. The board starts with every list shut. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

/**
 * One person's mini Eisenhower matrix: a 2×2 of counts, then their issues by quadrant.
 * Picking a quadrant opens the list narrowed to it; picking it again shows every quadrant.
 */
export function PersonMatrix({ matrix, today, expanded, onExpandedChange }: PersonMatrixProps) {
  const [only, setOnly] = useState<Quadrant | null>(null);
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

  return (
    <Card as="article" xstyle={styles.card}>
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

      {total > 0 && (
        // <details> so the toggle works before the page hydrates; afterwards the board owns it.
        <details
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
          <div {...stylex.props(styles.groups)}>
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
                      <IssueCard key={issue.id} issue={issue} today={today} />
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

const HOVER = "@media (hover: hover) and (pointer: fine)";

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
    outlineOffset: "2px",
    transitionProperty: "opacity, transform",
    transitionDuration: "160ms",
    transitionTimingFunction: motion.easeOut,
    transform: { default: null, ":active": "scale(0.97)" },
    opacity: { default: 1, [HOVER]: { default: 1, ":hover": 0.92 } },
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
      [HOVER]: { default: "transparent", ":hover": "rgba(29, 26, 51, 0.06)" },
    },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focus}` },
  },
  chevron: {
    transitionProperty: "transform",
    transitionDuration: "200ms",
    transitionTimingFunction: motion.easeOut,
  },
  chevronOpen: { transform: "rotate(90deg)" },
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
