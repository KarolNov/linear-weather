import * as stylex from "@stylexjs/stylex";
import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { boardSky, colors, fonts, gradients } from "./tokens.stylex";
import { useRain } from "./useRain";
import type { Weather } from "./WeatherIcon";

export interface SkyProps {
  /** "sunset" for the sign-in page, "dawn" (calmer, lighter) behind the board. */
  time?: "sunset" | "dawn";
  /**
   * The weather the dawn sky shows: clear for sun, more clouds for partly cloudy, grey with rain,
   * dark with lightning for a storm, hazy for fog. A change eases from one sky to the next.
   */
  weather?: Weather;
  children: ComponentChildren;
}

/** The top of each dawn sky, for browser chrome that should match it. Each sky starts from it. */
export const skyTops: Record<Weather, string> = {
  sun: "#b9d8ff",
  partly: "#cfe2ff",
  rain: "#8e9ab3",
  storm: "#2a2843",
  fog: "#d3d6df",
};

const WEATHERS: Weather[] = ["sun", "partly", "rain", "storm", "fog"];

type Depth = "far" | "mid" | "near";

// Spread across the sky by negative delays, so the page opens mid-drift. Nearer clouds are
// bigger, sharper and faster, which gives the sky some depth. A clear sky keeps only the
// first; the rest fade in as the weather turns.
const clouds: { top: string; width: string; seconds: number; offset: number; depth: Depth }[] = [
  { top: "6%", width: "clamp(180px, 22vw, 340px)", seconds: 150, offset: 0.2, depth: "far" },
  { top: "30%", width: "clamp(140px, 16vw, 260px)", seconds: 170, offset: 0.65, depth: "far" },
  { top: "16%", width: "clamp(240px, 30vw, 460px)", seconds: 95, offset: 0.6, depth: "mid" },
  { top: "50%", width: "clamp(220px, 26vw, 400px)", seconds: 110, offset: 0.15, depth: "mid" },
  { top: "64%", width: "clamp(300px, 40vw, 620px)", seconds: 65, offset: 0.7, depth: "near" },
];

/** A full-page sky with clouds drifting across it behind its content. */
export function Sky({ time = "sunset", weather = "partly", children }: SkyProps) {
  return time === "sunset" ? (
    <SunsetSky>{children}</SunsetSky>
  ) : (
    <DawnSky weather={weather}>{children}</DawnSky>
  );
}

function DawnSky({ weather, children }: { weather: Weather; children: ComponentChildren }) {
  const wet = weather === "rain" || weather === "storm";
  const tint = weather === "storm" ? styles.bodyStorm : weather === "rain" ? styles.bodyRain : null;
  const rainCanvas = useRain(wet ? (weather === "storm" ? "storm" : "rain") : null, TURN_MS);
  // Browser chrome and overscroll follow the sky; the page arrives with its first weather's.
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", skyTops[weather]);
    document.body.style.backgroundColor = skyTops[weather];
  }, [weather]);
  return (
    <div
      data-weather={weather}
      {...stylex.props(styles.sky, styles.dawn, weather === "storm" && stormText)}
    >
      <div aria-hidden="true" {...stylex.props(styles.scenery, styles.pinned)}>
        <CloudFilter />
        {/* Every sky is there, and only the weather's shows. A new one fades in on top of the
            last, which goes once it's covered, so nothing shows through mid-change. */}
        <div {...stylex.props(styles.skies)}>
          {WEATHERS.map((w) => (
            <div
              key={w}
              {...stylex.props(
                styles.layer,
                skies[w],
                w === weather ? styles.onTop : styles.covered,
              )}
            />
          ))}
        </div>
        {clouds.map((cloud, i) => (
          <Cloud
            key={cloud.top}
            cloud={cloud}
            tint={tint}
            hidden={weather === "sun" && i > 0}
            body={styles.bodyDay}
            underside={weather === "storm" ? styles.shadedStorm : styles.shaded}
          />
        ))}
        <div {...stylex.props(styles.layer, styles.motion, !wet && styles.hidden)}>
          <canvas ref={rainCanvas} {...stylex.props(styles.rain)} />
        </div>
        <div {...stylex.props(styles.layer, styles.motion, weather !== "storm" && styles.hidden)}>
          <div {...stylex.props(styles.lightning, weather !== "storm" && styles.still)} />
        </div>
        <div {...stylex.props(styles.layer, styles.fogHaze, weather !== "fog" && styles.hidden)}>
          <div {...stylex.props(styles.mist, styles.mistHigh, weather !== "fog" && styles.still)} />
          <div {...stylex.props(styles.mist, styles.mistLow, weather !== "fog" && styles.still)} />
        </div>
      </div>
      <div {...stylex.props(styles.content)}>{children}</div>
    </div>
  );
}

function SunsetSky({ children }: { children: ComponentChildren }) {
  return (
    <div {...stylex.props(styles.sky, styles.sunset)}>
      <div aria-hidden="true" {...stylex.props(styles.scenery)}>
        <CloudFilter />
        <div {...stylex.props(styles.stars)} />
        {clouds.map((cloud) => (
          <Cloud
            key={cloud.top}
            cloud={cloud}
            tint={null}
            hidden={false}
            body={styles.bodyDusk}
            underside={styles.lit}
          />
        ))}
        <div {...stylex.props(styles.haze)} />
      </div>
      <div {...stylex.props(styles.content)}>{children}</div>
    </div>
  );
}

function Cloud({
  cloud,
  tint,
  hidden,
  body,
  underside,
}: {
  cloud: (typeof clouds)[number];
  tint: stylex.StyleXStyles | null;
  hidden: boolean;
  body: stylex.StyleXStyles;
  underside: stylex.StyleXStyles;
}) {
  return (
    <div
      {...stylex.props(
        styles.travel,
        styles.place(cloud.top, cloud.width, cloud.seconds, -cloud.seconds * cloud.offset),
        hidden && styles.hidden,
      )}
    >
      <div {...stylex.props(styles.billow, styles[cloud.depth])}>
        <div {...stylex.props(styles.body, body, tint)}>
          <div {...stylex.props(styles.puff, styles.puffLeft)} />
          <div {...stylex.props(styles.puff, styles.puffTop)} />
          <div {...stylex.props(styles.puff, styles.puffRight)} />
          <div {...stylex.props(styles.base)} />
        </div>
        <div {...stylex.props(styles.underside, underside)} />
      </div>
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

// Rare and soft: a board the PM keeps open all day shouldn't strobe. Two quick flickers, then a
// long quiet.
const flash = stylex.keyframes({
  "0%, 88%, 100%": { opacity: 0 },
  "89%": { opacity: 0.22 },
  "90%": { opacity: 0.04 },
  "91.5%": { opacity: 0.16 },
  "93%": { opacity: 0 },
});

// Wisps of mist: fractal noise stretched sideways, white where the noise is dense and clear
// where it's thin. Stitched, so the tile repeats without a seam as it drifts.
const MIST_TILE = 900;
const mistTexture =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='450' preserveAspectRatio='none'%3E%3Cfilter id='m' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.0035 0.011' numOctaves='4' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 2.2 0 0 0 -0.75'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23m)'/%3E%3C/svg%3E\")";

const drift = stylex.keyframes({
  from: { transform: "translateX(0)" },
  to: { transform: `translateX(-${MIST_TILE}px)` },
});

const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";
// Long enough to notice the sky turning, short enough that the board doesn't wait on it.
const TURN_MS = 1600;
const TURN = `${TURN_MS}ms`;

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
  // The weather's own layer paints the sky, pinned over all of it.
  dawn: { color: colors.ink },
  scenery: { position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none" },
  // The board's height changes as issue lists open and shut. Pinned to the viewport, the sky
  // and its clouds stay put instead of sliding with the page.
  pinned: { position: "fixed" },
  content: { position: "relative" },

  // Its own stacking context, so the sky on top stays under the clouds.
  skies: { position: "absolute", inset: 0, isolation: "isolate" },
  layer: {
    position: "absolute",
    inset: 0,
    opacity: 1,
    transitionProperty: "opacity, visibility",
    transitionDuration: TURN,
    transitionTimingFunction: "ease-in-out",
  },
  // Faded out, then out of the way, so hidden rain and lightning aren't painted.
  hidden: { opacity: 0, visibility: "hidden" },
  onTop: { zIndex: 1 },
  // Under the new sky until it has faded in, then gone at once.
  covered: {
    opacity: 0,
    visibility: "hidden",
    transitionDelay: TURN,
    transitionDuration: "0s",
  },
  // Out of sight, so nothing to animate or keep on the GPU.
  still: { animationPlayState: "paused", willChange: "auto" },
  rain: { position: "absolute", inset: 0, width: "100%", height: "100%" },
  lightning: {
    position: "absolute",
    inset: 0,
    opacity: 0,
    backgroundImage:
      "radial-gradient(80vmax 50vmax at 30% 10%, rgba(236, 232, 255, 0.9), transparent 70%)",
    animationName: flash,
    animationDuration: "11s",
    animationIterationCount: "infinite",
  },
  // Rain and lightning only move, so with reduced motion they aren't there at all.
  motion: { display: { default: "block", [REDUCED_MOTION]: "none" } },
  // Over the clouds, so they fade into it: a veil thickest near the ground, then wisps of
  // mist drifting through it at two depths.
  fogHaze: {
    backgroundImage:
      "linear-gradient(to top, rgba(239, 238, 240, 0.85), rgba(226, 228, 234, 0.55) 55%, rgba(214, 217, 225, 0.3))",
  },
  // Only transforms animate, so each texture is drawn once and slid on the GPU. With reduced
  // motion the mist holds still.
  mist: {
    position: "absolute",
    left: 0,
    width: `calc(100% + ${MIST_TILE}px)`,
    backgroundImage: mistTexture,
    // Stretched to the layer's height and repeated only sideways: no seam across the sky.
    backgroundSize: `${MIST_TILE}px 100%`,
    backgroundRepeat: "repeat-x",
    willChange: "transform",
    animationName: drift,
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    animationPlayState: { default: "running", [REDUCED_MOTION]: "paused" },
  },
  // Far mist: high in the sky, fainter and slower.
  mistHigh: {
    top: 0,
    height: "60%",
    opacity: 0.55,
    animationDuration: "160s",
    maskImage: "linear-gradient(to bottom, transparent, #000 35%, #000 70%, transparent)",
  },
  // Near mist: low, thick and quicker. Started half a tile on, so it doesn't mirror the far one.
  mistLow: {
    bottom: 0,
    height: "65%",
    opacity: 0.9,
    animationDuration: "90s",
    animationDelay: "-45s",
    maskImage: "linear-gradient(to top, #000 45%, transparent)",
  },

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
    transitionProperty: "opacity, visibility",
    transitionDuration: TURN,
    transitionTimingFunction: "ease-in-out",
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

  body: {
    position: "absolute",
    inset: 0,
    filter: "url(#lw-cloud) blur(4px)",
    transitionProperty: "color",
    transitionDuration: TURN,
  },
  bodyDay: { color: "rgba(255, 255, 255, 0.95)" },
  bodyRain: { color: "rgba(214, 219, 231, 0.95)" },
  bodyStorm: { color: "rgba(98, 94, 128, 0.95)" },
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
    transitionProperty: "background-color",
    transitionDuration: TURN,
  },
  shaded: { backgroundColor: "rgba(150, 162, 196, 0.45)" },
  shadedStorm: { backgroundColor: "rgba(30, 28, 50, 0.55)" },
  lit: { backgroundColor: "rgba(255, 176, 120, 0.7)" },
});

// One per team weather. Rain and fog stay light enough for ink on top; the storm is dark, so
// text on it turns light.
const skies = stylex.create({
  sun: {
    backgroundImage: `radial-gradient(60vmax 40vmax at 85% 0%, rgba(255, 214, 130, 0.55), transparent 70%), linear-gradient(180deg, ${skyTops.sun} 0%, #dcebff 45%, #fff0dc 85%, #fff6e8 100%)`,
  },
  partly: {
    backgroundImage: `linear-gradient(180deg, ${skyTops.partly} 0%, #e9e4ff 45%, #ffe6d6 80%, #fff3e4 100%)`,
  },
  rain: {
    backgroundImage: `linear-gradient(180deg, ${skyTops.rain} 0%, #a9b3c7 40%, #c7cdd9 80%, #d8dce4 100%)`,
  },
  storm: {
    backgroundImage: `linear-gradient(180deg, ${skyTops.storm} 0%, #3d3a5a 40%, #565271 80%, #67637f 100%)`,
  },
  fog: {
    backgroundImage: `linear-gradient(180deg, ${skyTops.fog} 0%, #dfe1e7 45%, #e9e9ec 80%, #efeeef 100%)`,
  },
});

// Text straight on the storm turns light. Cards and controls keep their own ink.
const stormText = stylex.createTheme(boardSky, { text: colors.inkOnSky });
