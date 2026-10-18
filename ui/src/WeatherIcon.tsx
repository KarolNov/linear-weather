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

/** Hand-drawn weather glyphs, so the forecast looks the same on every OS (emoji don't). */
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
      {...stylex.props(styles.icon)}
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
            <path d="M17 36l-2 5M25 36l-2 5M33 36l-2 5" />
          </g>
        </>
      )}
      {weather === "storm" && (
        <>
          <Cloud y={-2} dark />
          <path d="M26 32l-6 8h5l-3 7 8-10h-5l3-5z" {...stylex.props(styles.bolt)} />
        </>
      )}
      {weather === "fog" && (
        <g {...stylex.props(styles.fog)}>
          <path d="M8 18h26M14 25h28M6 32h30M14 39h22" />
        </g>
      )}
    </svg>
  );
}

function Sun({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const [inner, outer] = [r + 3, r + 7];
    return `M${cx + Math.cos(a) * inner} ${cy + Math.sin(a) * inner}L${cx + Math.cos(a) * outer} ${cy + Math.sin(a) * outer}`;
  });
  return (
    <g>
      <path d={rays.join("")} {...stylex.props(styles.rays)} />
      <circle cx={cx} cy={cy} r={r} {...stylex.props(styles.sun)} />
    </g>
  );
}

function Cloud({ y, dark }: { y: number; dark?: boolean }) {
  return (
    <path
      transform={`translate(0 ${y})`}
      d="M14 36a8 8 0 0 1-1-15.9A11 11 0 0 1 34 18a7 7 0 0 1 1 14 4 4 0 0 1-1 4z"
      {...stylex.props(styles.cloud, dark && styles.cloudDark)}
    />
  );
}

const styles = stylex.create({
  icon: { display: "block", flexShrink: 0, overflow: "visible" },
  sun: { fill: colors.sun },
  rays: { stroke: colors.sun, strokeWidth: 3, strokeLinecap: "round" },
  cloud: { fill: colors.cloud, stroke: "rgba(29, 26, 51, 0.12)", strokeWidth: 1 },
  cloudDark: { fill: "#c9cfe0" },
  rain: { stroke: colors.rain, strokeWidth: 3, strokeLinecap: "round", fill: "none" },
  bolt: { fill: colors.sun, stroke: colors.accentStrong, strokeWidth: 1, strokeLinejoin: "round" },
  fog: { stroke: colors.fog, strokeWidth: 3.5, strokeLinecap: "round", fill: "none" },
});
