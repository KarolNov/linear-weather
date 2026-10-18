import * as stylex from "@stylexjs/stylex";
import { colors } from "ui/tokens.stylex";
import type { Quadrant } from "./board";

// One look per quadrant, shared by the legend and the board. Do is a storm warning, Schedule
// is rain, Delegate is the warm "someone else's" yellow, Drop is fog.

export const quadrantFill = stylex.create({
  do: {
    color: "#fff",
    backgroundImage: `linear-gradient(135deg, ${colors.storm}, #e8507a)`,
  },
  schedule: {
    color: "#fff",
    backgroundImage: `linear-gradient(135deg, ${colors.rain}, #7fb2ff)`,
  },
  delegate: {
    color: "#6b4300",
    backgroundImage: `linear-gradient(135deg, ${colors.focus}, #ffb35c)`,
  },
  drop: {
    color: "#4a5066",
    backgroundColor: `color-mix(in srgb, ${colors.fog} 25%, transparent)`,
  },
});

/** A quadrant's colour as a thin edge, e.g. down the side of an issue card. */
export const quadrantEdge = stylex.create({
  do: { borderInlineStartColor: colors.storm },
  schedule: { borderInlineStartColor: colors.rain },
  delegate: { borderInlineStartColor: "#ffb35c" },
  drop: { borderInlineStartColor: colors.fog },
});

export const quadrantInfo: Record<Quadrant, { name: string; rule: string }> = {
  do: { name: "Do", rule: "Important and urgent" },
  schedule: { name: "Schedule", rule: "Important, not urgent yet" },
  delegate: { name: "Delegate", rule: "Urgent, less important" },
  drop: { name: "Drop", rule: "Neither, question it" },
};
