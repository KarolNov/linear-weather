import * as stylex from "@stylexjs/stylex";
import type { ComponentChildren } from "preact";
import { colors, radii, space } from "./tokens.stylex";

export type BadgeTone = "neutral" | "sun" | "rain" | "storm" | "fog" | "onSky";

export interface BadgeProps {
  tone?: BadgeTone;
  children: ComponentChildren;
}

export function Badge({ tone = "neutral", children }: BadgeProps) {
  return <span {...stylex.props(styles.badge, styles[tone])}>{children}</span>;
}

const styles = stylex.create({
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xxs,
    paddingBlock: "2px",
    paddingInline: space.xs,
    borderRadius: radii.pill,
    fontSize: "0.75rem",
    fontWeight: 600,
    lineHeight: 1.5,
    whiteSpace: "nowrap",
  },
  neutral: { color: colors.inkMuted, backgroundColor: "rgba(29, 26, 51, 0.07)" },
  sun: { color: "#8a5a00", backgroundColor: `color-mix(in srgb, ${colors.sun} 25%, transparent)` },
  rain: {
    color: "#1f4fa8",
    backgroundColor: `color-mix(in srgb, ${colors.rain} 16%, transparent)`,
  },
  storm: {
    color: "#5428a8",
    backgroundColor: `color-mix(in srgb, ${colors.storm} 16%, transparent)`,
  },
  fog: { color: "#555b70", backgroundColor: `color-mix(in srgb, ${colors.fog} 22%, transparent)` },
  onSky: {
    color: colors.inkOnSky,
    backgroundColor: colors.surfaceOnSky,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderOnSky,
  },
});
