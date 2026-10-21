import * as stylex from "@stylexjs/stylex";
import { Badge, VisuallyHidden } from "ui";
import { colors, fonts, media, motion, radii, space } from "ui/tokens.stylex";
import { type BoardIssue, type CalendarDate, describeDue, type Quadrant } from "./board";
import { quadrantEdge } from "./quadrants";

export interface IssueCardProps {
  issue: BoardIssue;
  quadrant: Quadrant;
  today: CalendarDate;
  xstyle?: stylex.StyleXStyles;
}

/** One issue on the board, linking to it in Linear. */
export function IssueCard({ issue, quadrant, today, xstyle }: IssueCardProps) {
  const due = issue.dueDate ? describeDue(issue.dueDate, today) : null;
  return (
    <li {...stylex.props(styles.card, quadrantEdge[quadrant], xstyle)}>
      <div {...stylex.props(styles.meta)}>
        <span {...stylex.props(styles.identifier)}>{issue.identifier}</span>
        <span aria-hidden="true">·</span>
        <span>{issue.state.name}</span>
      </div>
      {/* The reason says why it's in this quadrant, e.g. "High priority, due in 3 days". */}
      <a
        href={issue.url}
        target="_blank"
        rel="noopener noreferrer"
        title={issue.placementReason}
        {...stylex.props(styles.title)}
      >
        {issue.title}
        <VisuallyHidden> (opens in Linear)</VisuallyHidden>
      </a>
      <div {...stylex.props(styles.tags)}>
        <Priority priority={issue.priority} />
        {due ? (
          <Badge tone={due.overdue || due.today ? "storm" : "neutral"}>
            <VisuallyHidden>Due </VisuallyHidden>
            {due.text}
          </Badge>
        ) : (
          <Badge tone="fog">No date</Badge>
        )}
        {issue.estimate !== null && (
          <Badge>
            {issue.estimate} {issue.estimate === 1 ? "pt" : "pts"}
          </Badge>
        )}
      </div>
    </li>
  );
}

const PRIORITY_LABEL: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

/** Linear's priority icon (bars, or a filled "!" for Urgent) with its name. */
function Priority({ priority }: { priority: number }) {
  const label = PRIORITY_LABEL[priority] ?? "No priority";
  // High fills three bars, Medium two, Low one.
  const filled = priority >= 2 && priority <= 4 ? 5 - priority : 0;
  return (
    <span {...stylex.props(styles.priority, priority === 1 && styles.urgent)}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        {priority === 1 ? (
          <>
            <rect width="14" height="14" rx="3" fill="currentColor" />
            <path d="M7 3.5v4.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" />
            <circle cx="7" cy="10.5" r="1" fill="#fff" />
          </>
        ) : priority === 0 ? (
          [2, 6, 10].map((x) => (
            <rect
              key={x}
              x={x - 1}
              y="6.25"
              width="2.5"
              height="1.5"
              rx="0.75"
              fill="currentColor"
            />
          ))
        ) : (
          [0, 1, 2].map((i) => (
            <rect
              key={i}
              x={1.5 + i * 4}
              y={8 - i * 3}
              width="3"
              height={4 + i * 3}
              rx="1"
              fill="currentColor"
              opacity={i < filled ? 1 : 0.25}
            />
          ))
        )}
      </svg>
      {label}
    </span>
  );
}

const styles = stylex.create({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderInlineStartWidth: 3,
    transitionProperty: "transform, box-shadow",
    transitionDuration: "160ms",
    transitionTimingFunction: motion.easeOut,
    transform: { default: null, [media.hover]: { default: null, ":hover": "translateY(-1px)" } },
    boxShadow: {
      default: null,
      [media.hover]: { default: null, ":hover": "0 6px 16px -8px rgba(29, 26, 51, 0.35)" },
    },
  },
  meta: {
    display: "flex",
    gap: space.xxs,
    fontSize: "0.75rem",
    color: colors.inkMuted,
  },
  identifier: { fontVariantNumeric: "tabular-nums", fontWeight: 600 },
  title: {
    color: colors.ink,
    fontWeight: 600,
    fontSize: "0.9375rem",
    lineHeight: 1.35,
    textDecoration: { default: "none", ":hover": "underline" },
    textUnderlineOffset: "2px",
    outlineOffset: "2px",
    borderRadius: "2px",
    overflowWrap: "anywhere",
  },
  tags: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.xxs },
  priority: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    paddingInlineEnd: space.xxs,
    fontSize: "0.75rem",
    fontWeight: 600,
    color: colors.inkMuted,
    fontFamily: fonts.body,
  },
  urgent: { color: colors.accentStrong },
});
