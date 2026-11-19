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

  // Controls: frosted cloud surfaces that read on every sky, and the night ink a picked toggle
  // turns.
  control: "rgba(255, 255, 255, 0.82)",
  controlHover: "rgba(255, 255, 255, 0.96)",
  controlBorder: "rgba(29, 26, 51, 0.12)",
  hover: "rgba(29, 26, 51, 0.06)",
  selected: "#1d1a33",
  onSelected: "#fffaf3",
});

/**
 * Each weather as a soft fill with ink dark enough to read on it (WCAG AA at small sizes), for
 * chips, tags and the forecast's weeks.
 */
export const weatherTones = stylex.defineVars({
  sunFill: "rgba(255, 193, 69, 0.24)",
  sunInk: "#7a4d00",
  partlyFill: "rgba(160, 178, 222, 0.24)",
  partlyInk: "#36456b",
  rainFill: "rgba(79, 134, 232, 0.16)",
  rainInk: "#1d4797",
  stormFill: "rgba(123, 79, 214, 0.16)",
  stormInk: "#4a2096",
  fogFill: "rgba(154, 160, 180, 0.22)",
  fogInk: "#474d61",
  awayFill: "rgba(143, 138, 184, 0.2)",
  awayInk: "#3f3a6b",
});

export const gradients = stylex.defineVars({
  sunset:
    "linear-gradient(180deg, #1f1747 0%, #46246b 28%, #9b3c78 52%, #e8665a 72%, #ffb35c 90%, #ffd98a 100%)",
  accent: "linear-gradient(135deg, #ffb35c 0%, #ff7a45 55%, #e8507a 100%)",
  // A sunrise seen from below: warm at the top, deeper at the base, so it reads as lit.
  sunrise: "linear-gradient(180deg, #ff9a5c 0%, #f9733b 55%, #ec5f2e 100%)",
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
  // A lit top edge, as on a cloud: the inner highlight is what makes a frosted surface read as
  // one rather than as a flat tint.
  card: "inset 0 1px 0 rgba(255, 255, 255, 0.75), 0 1px 2px rgba(29, 26, 51, 0.06), 0 12px 32px -12px rgba(29, 26, 51, 0.25)",
  control: "inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 1px 2px rgba(29, 26, 51, 0.08)",
  controlHover: "inset 0 1px 0 rgba(255, 255, 255, 1), 0 2px 6px -1px rgba(29, 26, 51, 0.14)",
  floating: "0 24px 60px -20px rgba(20, 10, 50, 0.55)",
  button:
    "inset 0 1px 0 rgba(255, 255, 255, 0.35), inset 0 -1px 0 rgba(150, 40, 10, 0.25), 0 6px 16px -6px rgba(232, 93, 42, 0.7)",
  buttonHover:
    "inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 -1px 0 rgba(150, 40, 10, 0.25), 0 10px 22px -8px rgba(232, 93, 42, 0.85)",
});

export const motion = stylex.defineVars({
  // Strong ease-out: moves at once, so a response feels immediate. The built-in curves are weak.
  easeOut: "cubic-bezier(0.23, 1, 0.32, 1)",
  // For something moving across the screen, which should start and land gently.
  easeInOut: "cubic-bezier(0.77, 0, 0.175, 1)",
  /** A press answering. */
  press: "140ms",
  /** A colour or tint changing under the pointer. */
  hover: "180ms",
});

export const media = stylex.defineConsts({
  /** Wide enough for the rebalance panel to dock beside the people, who keep two columns. */
  docked: "@media (min-width: 1080px)",
  /** Docked, with motion allowed: the panel slides in from the edge it's docked to. */
  dockedMotion: "@media (min-width: 1080px) and (prefers-reduced-motion: no-preference)",
  /** Touch screens fire :hover on tap and leave it stuck, so hover styles apply only with a mouse. */
  hover: "@media (hover: hover) and (pointer: fine)",
  /** A finger, which needs bigger targets. */
  touch: "@media (pointer: coarse)",
});
