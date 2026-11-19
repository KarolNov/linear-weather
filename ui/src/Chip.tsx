import * as stylex from "@stylexjs/stylex";
import type { ComponentChildren } from "preact";
import { colors, radii, shadows } from "./tokens.stylex";
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
 * A quiet status line for sitting straight on the sky, like the team's weather: a white chip with
 * a hairline, its weather's icon, then a line or two of text.
 */
export function Chip({ weather, label = "", children, as: Tag = "p", id, xstyle }: ChipProps) {
  return (
    <Tag id={id} {...stylex.props(styles.chip, xstyle)}>
      {weather && (
        <span {...stylex.props(styles.well)}>
          <WeatherIcon weather={weather} size={18} label={label} />
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
    gap: "6px",
    width: "fit-content",
    maxWidth: "100%",
    margin: 0,
    paddingBlock: "3px",
    paddingInlineStart: "6px",
    paddingInlineEnd: "10px",
    borderRadius: radii.sm,
    color: colors.ink,
    backgroundColor: colors.control,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.controlBorder,
    boxShadow: shadows.control,
    fontSize: "0.8125rem",
    fontWeight: 500,
    lineHeight: 1.4,
  },
  well: { alignSelf: "flex-start", display: "inline-flex", flexShrink: 0, paddingBlock: "2px" },
  text: { minWidth: 0, paddingBlock: "2px" },
});
