import * as stylex from "@stylexjs/stylex";
import type { ComponentChildren } from "preact";
import { colors, fonts, gradients } from "./tokens.stylex";

export interface SkyProps {
  /** "sunset" for the sign-in page, "dawn" (calmer, lighter) behind the board. */
  time?: "sunset" | "dawn";
  children: ComponentChildren;
}

type Depth = "far" | "mid" | "near";

// Spread across the sky by negative delays, so the page opens mid-drift. Nearer clouds are
// bigger, sharper and faster, which gives the sky some depth.
const clouds: { top: string; width: string; seconds: number; offset: number; depth: Depth }[] = [
  { top: "6%", width: "clamp(180px, 22vw, 340px)", seconds: 150, offset: 0.2, depth: "far" },
  { top: "30%", width: "clamp(140px, 16vw, 260px)", seconds: 170, offset: 0.65, depth: "far" },
  { top: "16%", width: "clamp(240px, 30vw, 460px)", seconds: 95, offset: 0.6, depth: "mid" },
  { top: "50%", width: "clamp(220px, 26vw, 400px)", seconds: 110, offset: 0.15, depth: "mid" },
  { top: "64%", width: "clamp(300px, 40vw, 620px)", seconds: 65, offset: 0.7, depth: "near" },
];

/** A full-page sky with clouds drifting across it behind its content. */
export function Sky({ time = "sunset", children }: SkyProps) {
  const sunset = time === "sunset";
  return (
    <div {...stylex.props(styles.sky, sunset ? styles.sunset : styles.dawn)}>
      <div aria-hidden="true" {...stylex.props(styles.scenery, !sunset && styles.pinned)}>
        <CloudFilter />
        {sunset && <div {...stylex.props(styles.stars)} />}
        {clouds.map((cloud) => (
          <div
            key={cloud.top}
            {...stylex.props(
              styles.travel,
              styles.place(cloud.top, cloud.width, cloud.seconds, -cloud.seconds * cloud.offset),
            )}
          >
            <div {...stylex.props(styles.billow, styles[cloud.depth])}>
              <div {...stylex.props(styles.body, sunset ? styles.bodyDusk : styles.bodyDay)}>
                <div {...stylex.props(styles.puff, styles.puffLeft)} />
                <div {...stylex.props(styles.puff, styles.puffTop)} />
                <div {...stylex.props(styles.puff, styles.puffRight)} />
                <div {...stylex.props(styles.base)} />
              </div>
              <div {...stylex.props(styles.underside, sunset ? styles.lit : styles.shaded)} />
            </div>
          </div>
        ))}
        {sunset && <div {...stylex.props(styles.haze)} />}
      </div>
      <div {...stylex.props(styles.content)}>{children}</div>
    </div>
  );
}

/**
 * Fractal noise that pushes the edges of the cloud shapes around, turning smooth ellipses into
 * billowing, wispy cumulus.
 */
function CloudFilter() {
  return (
    <svg width="0" height="0" aria-hidden="true" {...stylex.props(styles.filterDefs)}>
      <filter id="lw-cloud" x="-50%" y="-50%" width="200%" height="200%">
        <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves={4} seed={7} />
        <feDisplacementMap in="SourceGraphic" scale={90} />
      </filter>
      <filter id="lw-cloud-underside" x="-50%" y="-50%" width="200%" height="200%">
        <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves={3} seed={3} />
        <feDisplacementMap in="SourceGraphic" scale={50} />
      </filter>
    </svg>
  );
}

const travel = stylex.keyframes({
  from: { transform: "translateX(-110%)" },
  to: { transform: "translateX(105vw)" },
});

// Clouds swell and settle as they go.
const billow = stylex.keyframes({
  "0%, 100%": { transform: "translateY(0) scale(1, 1)" },
  "50%": { transform: "translateY(-6px) scale(1.04, 0.97)" },
});

const twinkle = stylex.keyframes({
  "0%, 100%": { opacity: 0.55 },
  "50%": { opacity: 0.9 },
});

const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";

const styles = stylex.create({
  sky: {
    position: "relative",
    minHeight: "100dvh",
    // "clip", not "hidden": clouds drift past the edges, and a hidden-overflow box can still be
    // scrolled sideways by focus or find-in-page, shifting the whole page.
    overflow: "clip",
    isolation: "isolate",
    fontFamily: fonts.body,
    WebkitFontSmoothing: "antialiased",
  },
  sunset: { backgroundImage: gradients.sunset, color: colors.inkOnSky },
  dawn: { backgroundImage: gradients.dawn, backgroundAttachment: "fixed", color: colors.ink },
  scenery: { position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none" },
  // The board's height changes as issue lists open and shut. Pinned to the viewport like the
  // gradient behind it, the clouds stay put instead of sliding with the page.
  pinned: { position: "fixed" },
  content: { position: "relative" },

  stars: {
    position: "absolute",
    insetInline: 0,
    top: 0,
    height: "45%",
    backgroundImage: [
      "radial-gradient(1.5px 1.5px at 12% 18%, #fff 50%, transparent 51%)",
      "radial-gradient(1px 1px at 27% 8%, #fff 50%, transparent 51%)",
      "radial-gradient(1.5px 1.5px at 44% 22%, #fff 50%, transparent 51%)",
      "radial-gradient(1px 1px at 63% 11%, #fff 50%, transparent 51%)",
      "radial-gradient(2px 2px at 78% 26%, #fff 50%, transparent 51%)",
      "radial-gradient(1px 1px at 88% 6%, #fff 50%, transparent 51%)",
      "radial-gradient(1px 1px at 6% 34%, #fff 50%, transparent 51%)",
      "radial-gradient(1.5px 1.5px at 94% 38%, #fff 50%, transparent 51%)",
    ].join(", "),
    maskImage: "linear-gradient(to bottom, #000 30%, transparent)",
    // Only opacity changes, nothing moves, so the twinkle stays on for reduced motion too.
    animationName: twinkle,
    animationDuration: "6s",
    animationIterationCount: "infinite",
    animationTimingFunction: "ease-in-out",
  },

  haze: {
    position: "absolute",
    insetInline: 0,
    bottom: 0,
    height: "22%",
    backgroundImage: "linear-gradient(to top, rgba(255, 217, 138, 0.55), transparent)",
  },

  filterDefs: { position: "absolute" },

  // Only transforms animate, so the browser can rasterise each filtered cloud once and slide
  // it around on the GPU. With reduced motion they hold still where the delays put them.
  travel: {
    position: "absolute",
    left: 0,
    aspectRatio: "2.4",
    willChange: "transform",
    animationName: travel,
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    animationPlayState: { default: "running", [REDUCED_MOTION]: "paused" },
  },
  place: (top: string, width: string, seconds: number, delay: number) => ({
    top,
    width,
    animationDuration: `${seconds}s`,
    animationDelay: `${delay}s`,
  }),
  billow: {
    position: "absolute",
    inset: 0,
    animationName: billow,
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
    animationPlayState: { default: "running", [REDUCED_MOTION]: "paused" },
  },
  far: { opacity: 0.5, filter: "blur(4px)", animationDuration: "19s" },
  mid: { opacity: 0.72, filter: "blur(2px)", animationDuration: "15s" },
  near: { opacity: 0.88, animationDuration: "12s" },

  body: { position: "absolute", inset: 0, filter: "url(#lw-cloud) blur(4px)" },
  bodyDay: { color: "rgba(255, 255, 255, 0.95)" },
  // Lit from below by a sun that's already set: dusky on top, glowing at the base.
  bodyDusk: { color: "rgba(196, 140, 190, 0.75)" },
  puff: {
    position: "absolute",
    borderRadius: "50%",
    backgroundColor: "currentColor",
  },
  puffLeft: { left: "8%", top: "34%", width: "38%", height: "58%" },
  puffTop: { left: "28%", top: "8%", width: "40%", height: "78%" },
  puffRight: { left: "54%", top: "26%", width: "34%", height: "62%" },
  base: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "52%",
    height: "40%",
    borderRadius: "50%",
    backgroundColor: "currentColor",
  },
  underside: {
    position: "absolute",
    left: "6%",
    right: "6%",
    top: "62%",
    height: "30%",
    borderRadius: "50%",
    filter: "url(#lw-cloud-underside) blur(6px)",
  },
  shaded: { backgroundColor: "rgba(150, 162, 196, 0.45)" },
  lit: { backgroundColor: "rgba(255, 176, 120, 0.7)" },
});
