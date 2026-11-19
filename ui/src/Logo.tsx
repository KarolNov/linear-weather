import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "./tokens.stylex";
import { WeatherIcon } from "./WeatherIcon";

export interface LogoProps {
  /** Light text for use on a sky background. */
  onSky?: boolean;
  size?: "md" | "lg";
  /**
   * Fit a one-row header on phones: drop "for Linear", and on the narrowest ones keep only the
   * icon (named for screen readers).
   */
  compactOnPhones?: boolean;
}

export function Logo({ onSky, size = "md", compactOnPhones }: LogoProps) {
  return (
    <span {...stylex.props(styles.logo, size === "lg" && styles.large)}>
      <WeatherIcon weather="partly" size={size === "lg" ? 44 : 30} label="" />
      <span
        {...stylex.props(
          styles.word,
          onSky && styles.onSky,
          compactOnPhones && styles.wordOnPhones,
        )}
      >
        Weather Forecast{" "}
        <span {...stylex.props(styles.light, compactOnPhones && styles.hiddenOnPhones)}>
          for Linear
        </span>
      </span>
    </span>
  );
}

const NARROWEST = "@media (max-width: 359.98px)";

const styles = stylex.create({
  logo: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    fontFamily: fonts.display,
    fontSize: "0.9375rem",
  },
  large: { fontSize: "1.625rem", gap: space.sm },
  word: { color: colors.ink, fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap" },
  onSky: { color: colors.inkOnSky },
  light: { fontWeight: 400 },
  // Visually hidden, not display:none, so the name is still read out.
  wordOnPhones: {
    position: { default: null, [NARROWEST]: "absolute" },
    width: { default: null, [NARROWEST]: "1px" },
    height: { default: null, [NARROWEST]: "1px" },
    overflow: { default: null, [NARROWEST]: "hidden" },
    clipPath: { default: null, [NARROWEST]: "inset(50%)" },
  },
  hiddenOnPhones: { display: { default: "none", "@media (min-width: 480px)": "inline" } },
});
