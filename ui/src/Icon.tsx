import * as stylex from "@stylexjs/stylex";

/** The interface's own small glyphs, drawn on one 16px grid with one stroke so they sit together. */
export type IconName =
  | "arrowRight"
  | "chevronDown"
  | "chevronRight"
  | "close"
  | "balance"
  | "sliders"
  | "expand"
  | "collapse"
  | "external"
  | "check";

export interface IconProps {
  name: IconName;
  size?: number;
  xstyle?: stylex.StyleXStyles;
}

const paths: Record<IconName, string> = {
  arrowRight: "M3 8h10M9 4l4 4-4 4",
  chevronDown: "M4 6l4 4 4-4",
  chevronRight: "M6 4l4 4-4 4",
  close: "M4 4l8 8M12 4l-8 8",
  // A pair of scales: the beam, its post, and a pan hanging from each end.
  balance: "M8 2.5v11M5 13.5h6M3 4.5h10M3 4.5L1.5 8.5h3zM13 4.5l-1.5 4h3z",
  sliders: "M2.5 5h6M11.5 5h2M2.5 11h2M7.5 11h6M10 3.5v3M6 9.5v3",
  expand: "M5 6l3-3 3 3M5 10l3 3 3-3",
  collapse: "M5 3l3 3 3-3M5 13l3-3 3 3",
  external: "M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5",
  check: "M3.5 8.5l3 3 6-7",
};

/** Decorative: the control or text beside it says what it means. */
export function Icon({ name, size = 16, xstyle }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      {...stylex.props(styles.icon, xstyle)}
    >
      <path d={paths[name]} />
    </svg>
  );
}

const styles = stylex.create({
  icon: {
    display: "block",
    flexShrink: 0,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
});
