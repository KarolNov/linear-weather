import * as stylex from "@stylexjs/stylex";
import { colors } from "./tokens.stylex";

export type Weather = "sun" | "partly" | "rain" | "storm" | "fog";

export const weatherLabels: Record<Weather, string> = {
  sun: "Sunny",
  partly: "Partly cloudy",
  rain: "Rain",
  storm: "Storm",
  fog: "Fog",
};

export interface WeatherIconProps {
  weather: Weather;
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
      {weather === "sun" && <Sun cx={24} cy={24} r={9} />}
      {weather === "partly" && (
        <>
          <Sun cx={17} cy={17} r={7} />
          <Cloud y={8} />
        </>
      )}
      {weather === "rain" && (
        <>
          <Cloud y={-2} dark />
          <g {...stylex.props(styles.rain)}>
            <path d="M17 36l-2 5" {...stylex.props(styles.drop)} />
            <path d="M25 36l-2 5" {...stylex.props(styles.drop, styles.delay1)} />
            <path d="M33 36l-2 5" {...stylex.props(styles.drop, styles.delay2)} />
          </g>
        </>
      )}
      {weather === "storm" && (
        <>
          {/* Drawn first, so the cloud covers its top and it strikes from underneath. */}
          <path d="M26 32l-6 8h5l-3 7 8-10h-5l3-5z" {...stylex.props(styles.bolt, styles.flash)} />
          <Cloud y={-2} dark />
        </>
      )}
      {weather === "fog" && (
        <g {...stylex.props(styles.fog)}>
          <path d="M8 14h26" {...stylex.props(styles.wisp)} />
          <path d="M14 21h28" {...stylex.props(styles.wisp, styles.wisp2)} />
          <path d="M6 28h30" {...stylex.props(styles.wisp, styles.wisp3)} />
          <path d="M14 35h22" {...stylex.props(styles.wisp, styles.wisp4)} />
        </g>
      )}
    </svg>
  );
}

// Each sun's rays, worked out once per shape and rounded to keep the markup short.
const rayPaths = new Map<string, string>();
const round = (n: number) => Math.round(n * 100) / 100;

function sunRays(cx: number, cy: number, r: number): string {
  const key = `${cx} ${cy} ${r}`;
  let d = rayPaths.get(key);
  if (!d) {
    d = Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      const [inner, outer] = [r + 3, r + 7];
      return `M${round(cx + Math.cos(a) * inner)} ${round(cy + Math.sin(a) * inner)}L${round(cx + Math.cos(a) * outer)} ${round(cy + Math.sin(a) * outer)}`;
    }).join("");
    rayPaths.set(key, d);
  }
  return d;
}

function Sun({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <path d={sunRays(cx, cy, r)} {...stylex.props(styles.rays, styles.spin)} />
      <circle cx={cx} cy={cy} r={r} {...stylex.props(styles.sun, styles.pulse)} />
    </g>
  );
}

function Cloud({ y, dark }: { y: number; dark?: boolean }) {
  return (
    <g {...stylex.props(styles.drift)}>
      <path
        transform={`translate(0 ${y})`}
        d="M14 36a8 8 0 0 1-1-15.9A11 11 0 0 1 34 18a7 7 0 0 1 1 14 4 4 0 0 1-1 4z"
        {...stylex.props(styles.cloud, dark && styles.cloudDark)}
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
  sun: { fill: colors.sun },
  rays: { stroke: colors.sun, strokeWidth: 3, strokeLinecap: "round" },
  cloud: { fill: colors.cloud, stroke: "rgba(29, 26, 51, 0.12)", strokeWidth: 1 },
  cloudDark: { fill: "#c9cfe0" },
  rain: { stroke: colors.rain, strokeWidth: 3, strokeLinecap: "round", fill: "none" },
  bolt: { fill: colors.sun, stroke: colors.accentStrong, strokeWidth: 1, strokeLinejoin: "round" },
  fog: { stroke: colors.fog, strokeWidth: 3.5, strokeLinecap: "round", fill: "none" },

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
