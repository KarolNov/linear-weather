import * as stylex from "@stylexjs/stylex";
import type { ComponentChildren } from "preact";
import { colors, shadows, space, weatherTones } from "./tokens.stylex";
import { type Glyph, WeatherIcon } from "./WeatherIcon";

export interface ChipProps {
  /** The weather it reports: its icon leads, and its colour rims the chip. */
  weather?: Glyph;
  /** Read out for the icon; "" when the text says it all. */
  label?: string;
  children: ComponentChildren;
  as?: "p" | "span" | "div";
  id?: string;
  xstyle?: stylex.StyleXStyles;
}

/**
 * A frosted status pill for sitting straight on the sky, like the team's weather: an icon in a
 * well of its weather's colour, then a line or two of text.
 */
export function Chip({ weather, label = "", children, as: Tag = "p", id, xstyle }: ChipProps) {
  return (
    <Tag id={id} {...stylex.props(styles.chip, weather && rims[weather], xstyle)}>
      {weather && (
        <span {...stylex.props(styles.well, weather && wells[weather])}>
          <WeatherIcon weather={weather} size={24} label={label} />
        </span>
      )}
      <span {...stylex.props(styles.text)}>{children}</span>
    </Tag>
  );
}

const styles = stylex.create({
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    width: "fit-content",
    maxWidth: "100%",
    margin: 0,
    paddingBlock: "3px",
    paddingInlineStart: "3px",
    paddingInlineEnd: space.md,
    // Round as a pill on one line; wrapped onto more, a softer card rather than a capsule.
    borderRadius: "20px",
    color: colors.ink,
    backgroundColor: colors.control,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.controlBorder,
    boxShadow: shadows.control,
    backdropFilter: "blur(16px) saturate(1.4)",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: 1.35,
  },
  well: {
    alignSelf: "flex-start",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: "50%",
  },
  text: { minWidth: 0, paddingBlock: "4px" },
});

const wells = stylex.create({
  sun: { backgroundColor: weatherTones.sunFill },
  partly: { backgroundColor: weatherTones.partlyFill },
  rain: { backgroundColor: weatherTones.rainFill },
  storm: { backgroundColor: weatherTones.stormFill },
  fog: { backgroundColor: weatherTones.fogFill },
  away: { backgroundColor: weatherTones.awayFill },
});

const rims = stylex.create({
  sun: { borderColor: `color-mix(in srgb, ${colors.sun} 55%, transparent)` },
  partly: { borderColor: colors.controlBorder },
  rain: { borderColor: `color-mix(in srgb, ${colors.rain} 40%, transparent)` },
  storm: { borderColor: `color-mix(in srgb, ${colors.storm} 45%, transparent)` },
  fog: { borderColor: `color-mix(in srgb, ${colors.fog} 70%, transparent)` },
  away: { borderColor: colors.controlBorder },
});
