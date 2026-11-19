import * as stylex from "@stylexjs/stylex";
import { useId } from "preact/hooks";
import { colors } from "./tokens.stylex";

/** A sky's weather: what a whole board can be under. */
export type Weather = "sun" | "partly" | "rain" | "storm" | "fog";

/** Every glyph: the sky's weathers, and the moon for someone away, which no sky shows. */
export type Glyph = Weather | "away";

export const weatherLabels: Record<Glyph, string> = {
  sun: "Sunny",
  partly: "Partly cloudy",
  rain: "Rain",
  storm: "Storm",
  fog: "Fog",
  away: "Away",
};

export interface WeatherIconProps {
  weather: Glyph;
  size?: number;
  /** Read out instead of the default label; pass "" when the icon is decorative. */
  label?: string;
}

/**
 * Hand-drawn weather glyphs, so the forecast looks the same on every OS (emoji don't). Each one
 * moves gently while hovered. On the board, where people will hover icons all day, check that
 * this still feels calm rather than busy.
 */
export function WeatherIcon({
  weather,
  size = 32,
  label = weatherLabels[weather],
}: WeatherIconProps) {
  // Gradients are looked up by id, and an icon can appear many times on a page.
  const id = useId();
  const ref = (name: string) => `url(#${id}-${name})`;
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      {...stylex.props(styles.icon, stylex.defaultMarker())}
    >
      <Defs id={id} weather={weather} />
      {weather === "sun" && <Sun cx={24} cy={24} r={9} fill={ref} />}
      {weather === "partly" && (
        <>
          <Sun cx={18} cy={17} r={7} fill={ref} />
          <Cloud x={3} y={7} scale={0.92} fill={ref("cloud")} />
        </>
      )}
      {weather === "rain" && (
        <>
          <g {...stylex.props(styles.rain)} fill={ref("drop")}>
            <path d={drop(16, 34)} {...stylex.props(styles.drop)} />
            <path d={drop(24, 37)} {...stylex.props(styles.drop, styles.delay1)} />
            <path d={drop(32, 34)} {...stylex.props(styles.drop, styles.delay2)} />
          </g>
          <Cloud x={0} y={-4} fill={ref("cloud")} />
        </>
      )}
      {weather === "storm" && (
        <>
          {/* Drawn first, so the cloud covers its top and it strikes from underneath. */}
          <path
            d="M26.5 27l-8 11.5h6l-3.5 8.5 10-13h-6l4-7z"
            fill={ref("bolt")}
            {...stylex.props(styles.bolt, styles.flash)}
          />
          <Cloud x={0} y={-4} fill={ref("cloud")} />
        </>
      )}
      {weather === "fog" && (
        <g {...stylex.props(styles.fog)} stroke={ref("mist")}>
          <path d="M9 15h24" {...stylex.props(styles.wisp)} />
          <path d="M15 22h26" {...stylex.props(styles.wisp, styles.wisp2)} />
          <path d="M7 29h28" {...stylex.props(styles.wisp, styles.wisp3)} />
          <path d="M14 36h21" {...stylex.props(styles.wisp, styles.wisp4)} />
        </g>
      )}
      {weather === "away" && (
        <g {...stylex.props(styles.drift)}>
          <path
            d="M27 7a17 17 0 1 0 14 27A14 14 0 0 1 27 7z"
            fill={ref("moon")}
            {...stylex.props(styles.moon)}
          />
          <path d={sparkle(37, 11, 3.2)} {...stylex.props(styles.star)} />
          <path d={sparkle(42, 20, 2)} {...stylex.props(styles.star, styles.starFaint)} />
        </g>
      )}
    </svg>
  );
}

/** Only the gradients the weather draws with. */
function Defs({ id, weather }: { id: string; weather: Glyph }) {
  const sunny = weather === "sun" || weather === "partly";
  const cloud = cloudColours[weather];
  return (
    <defs>
      {sunny && (
        <radialGradient id={`${id}-sun`} cx="38%" cy="35%" r="70%">
          <stop offset="0%" stop-color="#fff4c2" />
          <stop offset="45%" stop-color="#ffcf4a" />
          <stop offset="100%" stop-color="#ff9f1c" />
        </radialGradient>
      )}
      {cloud && (
        <linearGradient id={`${id}-cloud`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color={cloud[0]} />
          <stop offset="100%" stop-color={cloud[1]} />
        </linearGradient>
      )}
      {weather === "rain" && (
        <linearGradient id={`${id}-drop`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#8ab4ff" />
          <stop offset="100%" stop-color="#3a6fd8" />
        </linearGradient>
      )}
      {weather === "storm" && (
        <linearGradient id={`${id}-bolt`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#fff0a8" />
          <stop offset="55%" stop-color="#ffc83d" />
          <stop offset="100%" stop-color="#ff8a1f" />
        </linearGradient>
      )}
      {weather === "fog" && (
        // In the icon's own units: a horizontal line has no height for a bounding box to scale.
        <linearGradient
          id={`${id}-mist`}
          gradientUnits="userSpaceOnUse"
          x1="5"
          y1="0"
          x2="43"
          y2="0"
        >
          <stop offset="0%" stop-color="#9aa0b4" stop-opacity="0.35" />
          <stop offset="35%" stop-color="#8a90a6" />
          <stop offset="70%" stop-color="#8a90a6" />
          <stop offset="100%" stop-color="#9aa0b4" stop-opacity="0.35" />
        </linearGradient>
      )}
      {weather === "away" && (
        <linearGradient id={`${id}-moon`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#e4e0ff" />
          <stop offset="100%" stop-color="#9a94cf" />
        </linearGradient>
      )}
    </defs>
  );
}

// Top and bottom of each cloud: white in fair weather, greyer with rain, slate in a storm.
const cloudColours: Partial<Record<Glyph, [string, string]>> = {
  partly: ["#ffffff", "#e3e8f5"],
  rain: ["#eef1f8", "#b3bcd3"],
  storm: ["#b9bfd6", "#6d7494"],
};

// Each sun's rays, worked out once per shape and rounded to keep the markup short.
const rayPaths = new Map<string, string>();
const round = (n: number) => Math.round(n * 100) / 100;

function sunRays(cx: number, cy: number, r: number): string {
  const key = `${cx} ${cy} ${r}`;
  let d = rayPaths.get(key);
  if (!d) {
    d = Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      const [inner, outer] = [r + 3.5, r + 7];
      return `M${round(cx + Math.cos(a) * inner)} ${round(cy + Math.sin(a) * inner)}L${round(cx + Math.cos(a) * outer)} ${round(cy + Math.sin(a) * outer)}`;
    }).join("");
    rayPaths.set(key, d);
  }
  return d;
}

/** A raindrop hanging from (x, y): a point on top, round below. */
function drop(x: number, y: number): string {
  return `M${x} ${y}c-1.5 2.4-2.4 3.7-2.4 4.8a2.4 2.4 0 0 0 4.8 0c0-1.1-.9-2.4-2.4-4.8z`;
}

/** A four-pointed twinkle centred on (x, y). */
function sparkle(x: number, y: number, r: number): string {
  const k = r * 0.28;
  return `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}z`;
}

function Sun({
  cx,
  cy,
  r,
  fill,
}: {
  cx: number;
  cy: number;
  r: number;
  fill: (name: string) => string;
}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 4} {...stylex.props(styles.halo)} />
      <path d={sunRays(cx, cy, r)} {...stylex.props(styles.rays, styles.spin)} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fill("sun")}
        {...stylex.props(styles.sun, styles.pulse)}
      />
    </g>
  );
}

// Three puffs on a flat base: right, top (the biggest), then left.
const CLOUD = "M15 36h19a8 8 0 0 0 1.2-15.9 11 11 0 0 0-20.9-1.5A8.7 8.7 0 0 0 15 36z";

function Cloud({ x, y, scale = 1, fill }: { x: number; y: number; scale?: number; fill: string }) {
  return (
    <g {...stylex.props(styles.drift)}>
      <path
        transform={`translate(${x} ${y})${scale === 1 ? "" : ` scale(${scale})`}`}
        d={CLOUD}
        fill={fill}
        {...stylex.props(styles.cloud)}
      />
    </g>
  );
}

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

const pulse = stylex.keyframes({
  "0%, 100%": { transform: "scale(1)" },
  "50%": { transform: "scale(1.07)" },
});

const drift = stylex.keyframes({
  "0%, 100%": { transform: "translateX(0)" },
  "50%": { transform: "translateX(2px)" },
});

const fall = stylex.keyframes({
  "0%": { transform: "translate(0, -3px)", opacity: 0 },
  "20%, 80%": { opacity: 1 },
  "100%": { transform: "translate(-2px, 5px)", opacity: 0 },
});

// A double flicker right after the pointer arrives, then lit until the next one.
const flash = stylex.keyframes({
  "0%, 4%, 14%, 100%": { opacity: 1 },
  "6%, 12%": { opacity: 0.2 },
  "9%": { opacity: 0.9 },
});

// A band of mist drifting out, thinning, and coming back.
const wisp = stylex.keyframes({
  "0%, 100%": { transform: "translateX(0) scaleX(1)", opacity: 1 },
  "30%": { transform: "translateX(5px) scaleX(0.85)", opacity: 0.45 },
  "65%": { transform: "translateX(-3px) scaleX(1.08)", opacity: 0.8 },
});

// Animate only for a mouse hovering the icon: a tap on a touch screen would start a loop with
// no way to stop it. Anyone who asked for reduced motion gets none.
const HOVER_MOTION =
  "@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

// Hover animations are short-lived, so the loops are quick enough to read within a second or
// so. Shapes that look fine in any pose (sun, cloud) freeze where they are when the
// pointer leaves. Rain, lightning and fog would freeze half-faded or out of line, so they play
// only while hovered and snap back to rest. (The compiler needs the hover condition written out inside
// stylex.create, so each animated style repeats it.)
const styles = stylex.create({
  icon: { display: "block", flexShrink: 0, overflow: "visible" },
  halo: { fill: colors.sun, opacity: 0.18 },
  sun: { stroke: "rgba(214, 120, 0, 0.35)", strokeWidth: 0.75 },
  rays: { stroke: "#ffb21f", strokeWidth: 3, strokeLinecap: "round" },
  cloud: { stroke: "rgba(29, 26, 51, 0.14)", strokeWidth: 0.9, strokeLinejoin: "round" },
  rain: { stroke: "none" },
  bolt: { stroke: "#d9620f", strokeWidth: 0.9, strokeLinejoin: "round" },
  fog: { strokeWidth: 3.5, strokeLinecap: "round", fill: "none" },
  moon: { stroke: "rgba(29, 26, 51, 0.14)", strokeWidth: 0.9 },
  star: { fill: "#ffd36e" },
  starFaint: { opacity: 0.7 },

  spin: {
    animationName: spin,
    animationDuration: "7s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    animationPlayState: {
      default: "paused",
      [HOVER_MOTION]: { default: "paused", [stylex.when.ancestor(":hover")]: "running" },
    },
    transformBox: "fill-box",
    transformOrigin: "center",
  },
  pulse: {
    animationName: pulse,
    animationDuration: "2s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
    animationPlayState: {
      default: "paused",
      [HOVER_MOTION]: { default: "paused", [stylex.when.ancestor(":hover")]: "running" },
    },
    transformBox: "fill-box",
    transformOrigin: "center",
  },
  drift: {
    animationName: drift,
    animationDuration: "2.5s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
    animationPlayState: {
      default: "paused",
      [HOVER_MOTION]: { default: "paused", [stylex.when.ancestor(":hover")]: "running" },
    },
  },
  // Falling under gravity speeds up, so ease-in is right here, unlike for a UI response.
  drop: {
    animationName: {
      default: "none",
      [HOVER_MOTION]: { default: "none", [stylex.when.ancestor(":hover")]: fall },
    },
    animationDuration: "1.2s",
    animationTimingFunction: "ease-in",
    animationIterationCount: "infinite",
  },
  // Stagger the drops so they don't fall in step.
  delay1: { animationDelay: "-0.4s" },
  delay2: { animationDelay: "-0.8s" },
  flash: {
    animationName: {
      default: "none",
      [HOVER_MOTION]: { default: "none", [stylex.when.ancestor(":hover")]: flash },
    },
    animationDuration: "3.5s",
    animationTimingFunction: "steps(1, end)",
    animationIterationCount: "infinite",
  },
  // Each band drifts at its own pace and some the other way, so the mist never moves as one.
  wisp: {
    animationName: {
      default: "none",
      [HOVER_MOTION]: { default: "none", [stylex.when.ancestor(":hover")]: wisp },
    },
    animationDuration: "2.6s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
    transformBox: "fill-box",
    transformOrigin: "center",
  },
  wisp2: { animationDuration: "3.4s", animationDirection: "reverse", animationDelay: "-0.8s" },
  wisp3: { animationDuration: "2.9s", animationDelay: "-1.6s" },
  wisp4: { animationDuration: "3.8s", animationDirection: "reverse", animationDelay: "-0.4s" },
});
