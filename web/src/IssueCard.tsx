import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "preact/hooks";
import { Badge, VisuallyHidden } from "ui";
import { colors, fonts, media, motion, radii, shadows, space } from "ui/tokens.stylex";
import { type BoardIssue, type CalendarDate, describeDue, QUADRANTS, type Quadrant } from "./board";
import { useDismiss } from "./dismiss";
import { entrance } from "./motion";
import { quadrantEdge, quadrantFill, quadrantInfo } from "./quadrants";

export interface IssueCardProps {
  issue: BoardIssue;
  quadrant: Quadrant;
  today: CalendarDate;
  /** Places the issue by hand, or with null hands it back to the rules. No menu without it. */
  onPlace?: (quadrant: Quadrant | null) => void;
  /** A move of this issue is on its way to the server. */
  pending?: boolean;
  xstyle?: stylex.StyleXStyles;
}

/** One issue on the board, linking to it in Linear, with a menu to move it to another quadrant. */
export function IssueCard({ issue, quadrant, today, onPlace, pending, xstyle }: IssueCardProps) {
  const due = issue.dueDate ? describeDue(issue.dueDate, today) : null;
  const byHand = issue.quadrantSource === "OVERRIDE";
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <li
      aria-busy={pending || undefined}
      {...stylex.props(
        styles.card,
        quadrantEdge[quadrant],
        // Above the cards after it, so its menu isn't hidden under them.
        menuOpen && styles.raised,
        pending && styles.pending,
        xstyle,
      )}
    >
      <div {...stylex.props(styles.meta)}>
        <span {...stylex.props(styles.identifier)}>{issue.identifier}</span>
        <span aria-hidden="true">·</span>
        <span {...stylex.props(styles.state)}>{issue.state.name}</span>
        {onPlace && (
          <MoveMenu
            issue={issue}
            quadrant={quadrant}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            onPlace={onPlace}
            disabled={pending}
          />
        )}
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
        {/* Says where the rules would put it, e.g. "Placed by hand; the rules say Do (…)". */}
        {byHand && (
          <span title={issue.placementReason} {...stylex.props(styles.byHand)}>
            <Badge tone="sun">
              <PinIcon />
              By hand
              <VisuallyHidden>: {issue.placementReason}</VisuallyHidden>
            </Badge>
          </span>
        )}
      </div>
    </li>
  );
}

interface MoveMenuProps {
  issue: BoardIssue;
  quadrant: Quadrant;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlace: (quadrant: Quadrant | null) => void;
  disabled?: boolean;
}

/** "Move to…": the other quadrants, and a way back to the rules for an issue placed by hand. */
function MoveMenu({ issue, quadrant, open, onOpenChange, onPlace, disabled }: MoveMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const byHand = issue.quadrantSource === "OVERRIDE";
  useDismiss(
    ref,
    open,
    () => onOpenChange(false),
    () => trigger.current,
  );
  // The keyboard lands in the menu, on its first choice.
  useEffect(() => {
    if (open)
      ref.current?.querySelector<HTMLButtonElement>("[data-choice]:not(:disabled)")?.focus();
  }, [open]);
  const pick = (to: Quadrant | null) => {
    onOpenChange(false);
    trigger.current?.focus();
    onPlace(to);
  };
  const menuId = `move-${issue.id}`;

  return (
    <div ref={ref} {...stylex.props(styles.move)}>
      <button
        ref={trigger}
        type="button"
        // How the board finds it again after a move redraws the card in another list.
        data-move-trigger={issue.id}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        title={`Move ${issue.identifier}`}
        onClick={() => onOpenChange(!open)}
        {...stylex.props(styles.moveTrigger, open && styles.moveTriggerOpen)}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          {[1.5, 8].flatMap((x) =>
            [1.5, 8].map((y) => (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width="4.5"
                height="4.5"
                rx="1.2"
                fill="currentColor"
              />
            )),
          )}
        </svg>
        <VisuallyHidden>Move {issue.identifier}</VisuallyHidden>
      </button>
      {open && (
        // The fieldset groups the choices under their legend; the div draws the menu, since a
        // bordered fieldset cuts a notch for its legend.
        <div id={menuId} {...stylex.props(styles.menu, entrance.menu)}>
          <fieldset {...stylex.props(styles.choices)}>
            <legend {...stylex.props(styles.menuHeading)}>
              Move<VisuallyHidden> {issue.identifier}</VisuallyHidden> to
            </legend>
            {QUADRANTS.map((q) => {
              const current = q === quadrant;
              return (
                <button
                  key={q}
                  type="button"
                  data-choice
                  // Already there: by hand, there's nothing to change; by the rules, picking it
                  // would only pin it, which "Move to" doesn't promise.
                  disabled={current}
                  aria-current={current || undefined}
                  onClick={() => pick(q)}
                  {...stylex.props(styles.choice, current && styles.choiceCurrent)}
                >
                  <span aria-hidden="true" {...stylex.props(styles.swatch, quadrantFill[q])} />
                  <span {...stylex.props(styles.choiceName)}>{quadrantInfo[q].name}</span>
                  {current && <span {...stylex.props(styles.here)}>Here</span>}
                </button>
              );
            })}
            {byHand && (
              <>
                <hr {...stylex.props(styles.divider)} />
                <button
                  type="button"
                  data-choice
                  onClick={() => pick(null)}
                  {...stylex.props(styles.choice)}
                >
                  <span {...stylex.props(styles.choiceName)}>Let the rules place it</span>
                </button>
              </>
            )}
          </fieldset>
        </div>
      )}
    </div>
  );
}

function PinIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <circle cx="5" cy="3.5" r="2.5" fill="currentColor" />
      <path d="M5 6v3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
    </svg>
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
  raised: { position: "relative", zIndex: 2 },
  // Still readable, but clearly not settled yet.
  pending: { opacity: 0.6 },
  meta: {
    display: "flex",
    alignItems: "center",
    gap: space.xxs,
    fontSize: "0.75rem",
    color: colors.inkMuted,
  },
  state: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  move: { position: "relative", marginInlineStart: "auto", flexShrink: 0 },
  moveTrigger: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: { default: "24px", [media.touch]: "36px" },
    height: { default: "24px", [media.touch]: "36px" },
    marginBlock: { default: "-4px", [media.touch]: "-10px" },
    marginInlineEnd: "-6px",
    padding: 0,
    borderWidth: 0,
    borderRadius: radii.sm,
    color: colors.inkMuted,
    cursor: { default: "pointer", ":disabled": "default" },
    backgroundColor: {
      default: "transparent",
      [media.hover]: { default: "transparent", ":hover": "rgba(29, 26, 51, 0.08)" },
    },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focus}` },
    transitionProperty: "transform, background-color",
    transitionDuration: "160ms, 200ms",
    transitionTimingFunction: `${motion.easeOut}, ease`,
    transform: { default: null, ":active": "scale(0.94)" },
  },
  moveTriggerOpen: { backgroundColor: "rgba(29, 26, 51, 0.08)", color: colors.ink },
  menu: {
    position: "absolute",
    insetInlineEnd: 0,
    top: "calc(100% + 6px)",
    zIndex: 2,
    display: "flex",
    flexDirection: "column",
    minWidth: "200px",
    padding: "6px",
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.7)",
    backgroundColor: colors.surfaceStrong,
    backdropFilter: "blur(16px)",
    boxShadow: shadows.card,
    transformOrigin: "top right",
  },
  choices: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    margin: 0,
    padding: 0,
    borderWidth: 0,
  },
  menuHeading: {
    padding: 0,
    paddingBlock: "4px",
    paddingInline: space.xs,
    fontSize: "0.6875rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: colors.inkMuted,
  },
  choice: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    minHeight: { default: null, [media.touch]: "44px" },
    paddingBlock: "7px",
    paddingInline: space.xs,
    borderWidth: 0,
    borderRadius: radii.sm,
    font: "inherit",
    fontSize: "0.875rem",
    fontWeight: 500,
    color: colors.ink,
    textAlign: "start",
    cursor: { default: "pointer", ":disabled": "default" },
    backgroundColor: {
      default: "transparent",
      ":focus-visible": "rgba(29, 26, 51, 0.06)",
      [media.hover]: { default: "transparent", ":hover:not(:disabled)": "rgba(29, 26, 51, 0.06)" },
    },
    outline: "none",
  },
  choiceCurrent: { color: colors.inkMuted },
  choiceName: { flexGrow: 1 },
  swatch: { width: "12px", height: "12px", flexShrink: 0, borderRadius: "4px" },
  here: { fontSize: "0.75rem", color: colors.inkMuted },
  divider: {
    marginBlock: "4px",
    marginInline: 0,
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  byHand: { display: "inline-flex" },
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
