import * as stylex from "@stylexjs/stylex";
import { colors } from "ui/tokens.stylex";
import type { Quadrant } from "./board";

// One look per quadrant, shared by the legend and the board: a pale tint with a dot of the
// quadrant's colour, as Linear marks labels. Do is a storm warning, Schedule is rain, Delegate is
// the warm "someone else's" amber, Drop is fog.

const DO = "#7b5bd6";
const SCHEDULE = "#4f86e8";
const DELEGATE = "#d9962b";
const DROP = "#9aa0ac";

export const quadrantFill = stylex.create({
  do: { color: colors.ink, backgroundColor: `color-mix(in srgb, ${DO} 9%, white)` },
  schedule: { color: colors.ink, backgroundColor: `color-mix(in srgb, ${SCHEDULE} 9%, white)` },
  delegate: { color: colors.ink, backgroundColor: `color-mix(in srgb, ${DELEGATE} 11%, white)` },
  drop: { color: colors.ink, backgroundColor: `color-mix(in srgb, ${DROP} 12%, white)` },
});

/** A quadrant's colour as a small dot before its name. */
export const quadrantDot = stylex.create({
  do: { backgroundColor: DO },
  schedule: { backgroundColor: SCHEDULE },
  delegate: { backgroundColor: DELEGATE },
  drop: { backgroundColor: DROP },
});

/** The dot's shape; pair with `quadrantDot[q]`. */
export const dot = stylex.create({
  dot: {
    display: "inline-block",
    flexShrink: 0,
    width: 7,
    height: 7,
    borderRadius: "50%",
  },
});

/** A quadrant's colour as a thin edge, e.g. down the side of an issue card. */
export const quadrantEdge = stylex.create({
  do: { borderInlineStartColor: DO },
  schedule: { borderInlineStartColor: SCHEDULE },
  delegate: { borderInlineStartColor: DELEGATE },
  drop: { borderInlineStartColor: DROP },
});

export const quadrantInfo: Record<Quadrant, { name: string; rule: string }> = {
  do: { name: "Do", rule: "Important and urgent" },
  schedule: { name: "Schedule", rule: "Important, not urgent yet" },
  delegate: { name: "Delegate", rule: "Urgent, less important" },
  drop: { name: "Drop", rule: "Neither, question it" },
};
