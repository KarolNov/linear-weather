import * as stylex from "@stylexjs/stylex";
import type { ComponentChildren } from "preact";
import { colors, radii, space } from "./tokens.stylex";
import { type Weather, WeatherIcon } from "./WeatherIcon";

export interface AlertProps {
  /** The weather that sets the mood: a storm for failures, rain for softer warnings. */
  weather?: Weather;
  onSky?: boolean;
  children: ComponentChildren;
}

export function Alert({ weather = "storm", onSky, children }: AlertProps) {
  return (
    <div role="alert" {...stylex.props(styles.alert, onSky && styles.onSky)}>
      <WeatherIcon weather={weather} size={20} label="" />
      <div {...stylex.props(styles.body)}>{children}</div>
    </div>
  );
}

const styles = stylex.create({
  alert: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderRadius: radii.md,
    color: colors.ink,
    // White with a red hairline: reads as a problem on every sky, without a tinted slab.
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: `color-mix(in srgb, ${colors.danger} 35%, transparent)`,
    boxShadow: "0 1px 2px rgba(15, 17, 23, 0.06)",
    fontSize: "0.8125rem",
    lineHeight: 1.45,
  },
  onSky: {
    color: colors.inkOnSky,
    backgroundColor: "rgba(31, 23, 71, 0.45)",
    borderColor: "rgba(255, 255, 255, 0.22)",
  },
  body: { minWidth: 0 },
});
