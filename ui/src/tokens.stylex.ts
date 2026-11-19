import * as stylex from "@stylexjs/stylex";

// The palette is a sky: a sunset for the sign-in page, a dawn behind the board that turns with
// the team's weather (its skies are in Sky), and one colour per kind of weather. Quadrant colours
// reuse the weather ones so the board reads the same way the forecast does: Do is a storm
// warning, Drop is fog.

export const colors = stylex.defineVars({
  // Quiet, near-neutral ink: the sky carries the colour, the UI on it stays out of the way.
  ink: "#1f2023",
  inkMuted: "#6b6f76",
  inkFaint: "#8a8f98",
  inkOnSky: "#fffaf3",
  inkOnSkyMuted: "rgba(255, 250, 243, 0.78)",

  surface: "rgba(255, 255, 255, 0.97)",
  surfaceStrong: "#ffffff",
  /** A well inside a surface: tiles, wells, a quiet section. */
  subtle: "#f6f7f8",
  surfaceOnSky: "rgba(255, 255, 255, 0.14)",
  borderOnSky: "rgba(255, 255, 255, 0.28)",
  border: "rgba(15, 17, 23, 0.08)",
  borderStrong: "rgba(15, 17, 23, 0.14)",

  accent: "#5e6ad2",
  accentStrong: "#4c57c2",
  accentSoft: "rgba(94, 106, 210, 0.1)",
  focus: "rgba(94, 106, 210, 0.55)",

  sun: "#ffc145",
  cloud: "#eef1f8",
  rain: "#4f86e8",
  storm: "#7b4fd6",
  fog: "#9aa0b4",

  danger: "#d8434b",
  dangerSoft: "rgba(216, 67, 75, 0.14)",

  // Controls: frosted cloud surfaces that read on every sky, and the night ink a picked toggle
  // turns.
  control: "#ffffff",
  controlHover: "#f7f8f9",
  controlBorder: "rgba(15, 17, 23, 0.12)",
  hover: "rgba(15, 17, 23, 0.05)",
  selected: "#eef0fb",
  onSelected: "#3d48a8",
});

/**
 * Each weather as a soft fill with ink dark enough to read on it (WCAG AA at small sizes), for
 * chips, tags and the forecast's weeks.
 */
export const weatherTones = stylex.defineVars({
  sunFill: "#fdf6e3",
  sunInk: "#7a5200",
  partlyFill: "#f1f4f9",
  partlyInk: "#3d4a66",
  rainFill: "#eef3fd",
  rainInk: "#1f4a99",
  stormFill: "#f3effc",
  stormInk: "#4b2a96",
  fogFill: "#f2f3f5",
  fogInk: "#4b505c",
  awayFill: "#f2f1f8",
  awayInk: "#45406b",
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
export const boardSky = stylex.defineVars({ text: "#1f2023" });

export const fonts = stylex.defineVars({
  body: '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  // One family throughout, as in Linear: hierarchy from size and weight, not a second face.
  display: '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
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
  sm: "6px",
  md: "8px",
  lg: "12px",
  pill: "999px",
});

export const shadows = stylex.defineVars({
  // A lit top edge, as on a cloud: the inner highlight is what makes a frosted surface read as
  // one rather than as a flat tint.
  // Barely there: a hairline border does the separating, the shadow only lifts it off the sky.
  card: "0 1px 2px rgba(15, 17, 23, 0.04), 0 4px 16px -8px rgba(15, 17, 23, 0.16)",
  control: "0 1px 1px rgba(15, 17, 23, 0.04)",
  controlHover: "0 1px 2px rgba(15, 17, 23, 0.08)",
  floating: "0 16px 40px -16px rgba(15, 17, 23, 0.4)",
  button: "inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 1px 2px rgba(15, 17, 23, 0.16)",
  buttonHover: "inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 1px 3px rgba(15, 17, 23, 0.22)",
});

export const motion = stylex.defineVars({
  // Strong ease-out: moves at once, so a response feels immediate. The built-in curves are weak.
  easeOut: "cubic-bezier(0.23, 1, 0.32, 1)",
  // For something moving across the screen, which should start and land gently.
  easeInOut: "cubic-bezier(0.77, 0, 0.175, 1)",
  /** A press answering. */
  press: "120ms",
  /** A colour or tint changing under the pointer: quick, so hover feels instant. */
  hover: "120ms",
});

export const media = stylex.defineConsts({
  /** Wide enough for the rebalance panel to dock beside the people, who keep two columns. */
  docked: "@media (min-width: 1080px)",
  /** Docked, with motion allowed: the panel slides in from the edge it's docked to. */
  dockedMotion: "@media (min-width: 1080px) and (prefers-reduced-motion: no-preference)",
  /** Touch screens fire :hover on tap and leave it stuck, so hover styles apply only with a mouse. */
  hover: "@media (hover: hover) and (pointer: fine)",
  /** A phone's width: controls drop to icons, secondary text hides. */
  phone: "@media (max-width: 639px)",
  /** Wider than a phone; the complement of `phone`. */
  abovePhone: "@media (min-width: 640px)",
  /** A finger, which needs bigger targets. */
  touch: "@media (pointer: coarse)",
});
