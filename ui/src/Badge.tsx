import * as stylex from "@stylexjs/stylex";
import type { ComponentChildren } from "preact";
import { colors, radii, space, weatherTones } from "./tokens.stylex";

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
  sun: { color: weatherTones.sunInk, backgroundColor: weatherTones.sunFill },
  rain: { color: weatherTones.rainInk, backgroundColor: weatherTones.rainFill },
  storm: { color: weatherTones.stormInk, backgroundColor: weatherTones.stormFill },
  fog: { color: weatherTones.fogInk, backgroundColor: weatherTones.fogFill },
  onSky: {
    color: colors.inkOnSky,
    backgroundColor: colors.surfaceOnSky,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderOnSky,
  },
});
