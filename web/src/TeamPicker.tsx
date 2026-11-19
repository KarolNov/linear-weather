import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "preact/hooks";
import { colors, fonts, media, motion, radii, shadows, space } from "ui/tokens.stylex";
import type { Team } from "./board";
import { useDismiss } from "./dismiss";
import { entrance } from "./motion";

export interface TeamPickerProps {
  teams: Team[];
  selected: Team;
  /** Keep `?demo=true` on the links, so picking a team stays in the demo. */
  demo?: boolean;
}

/**
 * A menu of teams. Each team is a link (`/?team=…`), so a board can be shared or bookmarked,
 * and `<details>` opens the menu before the page hydrates. Once it has, clicking outside or
 * pressing Escape closes it.
 */
export function TeamPicker({ teams, selected, demo }: TeamPickerProps) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  // Hydration leaves `open` as the DOM has it, so catch up with a menu opened before then.
  useEffect(() => {
    if (ref.current?.open) setOpen(true);
  }, []);

  useDismiss(
    ref,
    open,
    () => {
      if (ref.current) ref.current.open = false;
    },
    () => ref.current?.querySelector("summary"),
  );

  return (
    <details
      ref={ref}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      {...stylex.props(styles.picker)}
    >
      <summary aria-label={`Team: ${selected.name}. Switch team`} {...stylex.props(styles.trigger)}>
        <TeamKey team={selected} />
        <span {...stylex.props(styles.triggerName)}>{selected.name}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
          {...stylex.props(styles.chevron, open && styles.chevronOpen)}
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </summary>
      <nav aria-label="Teams" {...stylex.props(styles.menu, entrance.menu)}>
        <p {...stylex.props(styles.menuHeading)}>Switch team</p>
        <ul {...stylex.props(styles.list)}>
          {teams.map((team) => {
            const current = team.id === selected.id;
            return (
              <li key={team.id}>
                <a
                  href={teamHref(team, demo)}
                  aria-current={current ? "page" : undefined}
                  {...stylex.props(styles.option, current && styles.optionCurrent)}
                >
                  <TeamKey team={team} />
                  <span {...stylex.props(styles.optionName)}>{team.name}</span>
                  {current && (
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                      <path
                        d="M3 7.5 5.75 10 11 4"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </details>
  );
}

function TeamKey({ team }: { team: Team }) {
  return (
    <span aria-hidden="true" {...stylex.props(styles.key)}>
      {team.key}
    </span>
  );
}

function teamHref(team: Team, demo?: boolean): string {
  const params = new URLSearchParams(demo ? { demo: "true" } : {});
  params.set("team", team.id);
  return `/?${params}`;
}

const styles = stylex.create({
  picker: { position: "relative" },
  trigger: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    // The same frosted control as the board's buttons, and as tall, so they line up.
    height: { default: "36px", [media.touch]: "44px" },
    paddingInlineStart: "5px",
    paddingInlineEnd: space.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.controlBorder,
    backgroundColor: {
      default: colors.control,
      [media.hover]: { default: colors.control, ":hover": colors.controlHover },
    },
    boxShadow: {
      default: shadows.control,
      [media.hover]: { default: shadows.control, ":hover": shadows.controlHover },
    },
    backdropFilter: "blur(12px) saturate(1.4)",
    color: colors.ink,
    fontWeight: 600,
    fontSize: "0.875rem",
    cursor: "pointer",
    userSelect: "none",
    listStyle: "none",
    "::-webkit-details-marker": { display: "none" },
    transitionProperty: "transform, background-color, box-shadow",
    transitionDuration: `${motion.press}, ${motion.hover}, ${motion.hover}`,
    transitionTimingFunction: `${motion.easeOut}, ease, ease`,
    transform: { default: null, ":active": "scale(0.97)" },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focus}` },
    outlineOffset: "2px",
    maxWidth: "min(320px, 80vw)",
  },
  triggerName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  chevron: {
    flexShrink: 0,
    color: colors.inkMuted,
    transitionProperty: "transform",
    transitionDuration: "200ms",
    transitionTimingFunction: motion.easeOut,
  },
  chevronOpen: { transform: "rotate(180deg)" },
  key: {
    flexShrink: 0,
    paddingBlock: "3px",
    paddingInline: "7px",
    borderRadius: radii.pill,
    backgroundColor: "rgba(29, 26, 51, 0.07)",
    color: colors.inkMuted,
    fontFamily: fonts.body,
    fontSize: "0.6875rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
  },
  menu: {
    position: "absolute",
    insetInlineEnd: 0,
    top: "calc(100% + 8px)",
    zIndex: 2,
    minWidth: "240px",
    maxWidth: "min(320px, calc(100vw - 32px))",
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
  menuHeading: {
    paddingBlock: "6px",
    paddingInline: space.xs,
    fontSize: "0.6875rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: colors.inkMuted,
  },
  list: { listStyle: "none", margin: 0, padding: 0 },
  option: {
    display: "flex",
    alignItems: "center",
    minHeight: { default: null, [media.touch]: "44px" },
    gap: space.xs,
    paddingBlock: space.xs,
    paddingInline: space.xs,
    borderRadius: radii.sm,
    color: colors.ink,
    fontSize: "0.9375rem",
    fontWeight: 500,
    textDecoration: "none",
    backgroundColor: {
      default: "transparent",
      ":focus-visible": "rgba(29, 26, 51, 0.06)",
      [media.hover]: { default: "transparent", ":hover": "rgba(29, 26, 51, 0.06)" },
    },
    outline: "none",
  },
  optionCurrent: { fontWeight: 700, color: colors.accentStrong },
  optionName: {
    flexGrow: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
