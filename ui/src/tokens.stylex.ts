import * as stylex from "@stylexjs/stylex";

// The palette is a sky: a sunset for the sign-in page, a dawn behind the board that turns with
// the team's weather (its skies are in Sky), and one colour per kind of weather. Quadrant colours
// reuse the weather ones so the board reads the same way the forecast does: Do is a storm
// warning, Drop is fog.

export const colors = stylex.defineVars({
  ink: "#1d1a33",
  inkMuted: "#5b5675",
  inkOnSky: "#fffaf3",
  inkOnSkyMuted: "rgba(255, 250, 243, 0.78)",

  surface: "rgba(255, 255, 255, 0.72)",
  surfaceStrong: "rgba(255, 255, 255, 0.92)",
  surfaceOnSky: "rgba(255, 255, 255, 0.14)",
  borderOnSky: "rgba(255, 255, 255, 0.28)",
  border: "rgba(29, 26, 51, 0.1)",

  accent: "#ff7a45",
  accentStrong: "#e85d2a",
  focus: "#ffd36e",

  sun: "#ffc145",
  cloud: "#eef1f8",
  rain: "#4f86e8",
  storm: "#7b4fd6",
  fog: "#9aa0b4",

  danger: "#d8434b",
  dangerSoft: "rgba(216, 67, 75, 0.14)",
});

export const gradients = stylex.defineVars({
  sunset:
    "linear-gradient(180deg, #1f1747 0%, #46246b 28%, #9b3c78 52%, #e8665a 72%, #ffb35c 90%, #ffd98a 100%)",
  accent: "linear-gradient(135deg, #ffb35c 0%, #ff7a45 55%, #e8507a 100%)",
});

// Text straight on the board's sky: ink, which the storm sky turns light (see Sky). Cards and
// controls set their own colour, so only text meant to sit on the sky uses this.
export const boardSky = stylex.defineVars({ text: "#1d1a33" });

export const fonts = stylex.defineVars({
  body: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  display: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", sans-serif',
});

export const space = stylex.defineVars({
  xxs: "4px",
  xs: "8px",
  sm: "12px",
  md: "16px",
  lg: "24px",
  xl: "32px",
  xxl: "48px",
});

export const radii = stylex.defineVars({
  sm: "8px",
  md: "14px",
  lg: "24px",
  pill: "999px",
});

export const shadows = stylex.defineVars({
  card: "0 1px 2px rgba(29, 26, 51, 0.06), 0 12px 32px -12px rgba(29, 26, 51, 0.25)",
  floating: "0 24px 60px -20px rgba(20, 10, 50, 0.55)",
  button: "0 8px 20px -8px rgba(232, 93, 42, 0.7)",
});

export const motion = stylex.defineVars({
  // Strong ease-out: moves at once, so a response feels immediate. The built-in curves are weak.
  easeOut: "cubic-bezier(0.23, 1, 0.32, 1)",
});

export const media = stylex.defineConsts({
  /** Touch screens fire :hover on tap and leave it stuck, so hover styles apply only with a mouse. */
  hover: "@media (hover: hover) and (pointer: fine)",
  /** A finger, which needs bigger targets. */
  touch: "@media (pointer: coarse)",
});
