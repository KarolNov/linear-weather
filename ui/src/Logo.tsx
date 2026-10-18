import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "./tokens.stylex";
import { WeatherIcon } from "./WeatherIcon";

export interface LogoProps {
  /** Light text for use on a sky background. */
  onSky?: boolean;
  size?: "md" | "lg";
}

export function Logo({ onSky, size = "md" }: LogoProps) {
  return (
    <span {...stylex.props(styles.logo, size === "lg" && styles.large)}>
      <WeatherIcon weather="partly" size={size === "lg" ? 44 : 30} label="" />
      <span {...stylex.props(styles.word, onSky && styles.onSky)}>
        Weather Forecast <span {...stylex.props(styles.light)}>for Linear</span>
      </span>
    </span>
  );
}

const styles = stylex.create({
  logo: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    fontFamily: fonts.display,
    fontSize: "1.125rem",
  },
  large: { fontSize: "1.625rem", gap: space.sm },
  word: { color: colors.ink, fontWeight: 700, letterSpacing: "-0.01em", whiteSpace: "nowrap" },
  onSky: { color: colors.inkOnSky },
  light: { fontWeight: 400 },
});
