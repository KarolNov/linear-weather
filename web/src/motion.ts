import * as stylex from "@stylexjs/stylex";
import { motion } from "ui/tokens.stylex";

// Entrances shared by the pages. Everything rises a little and fades in; with reduced motion it
// only fades. `fill-mode: backwards` holds the start frame through the delay, then lets go, so
// an element's own hover transform still works once it has arrived.

export const rise = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(var(--rise, 16px))" },
  to: { opacity: 1, transform: "none" },
});

export const fadeIn = stylex.keyframes({ from: { opacity: 0 } });

const slideIn = stylex.keyframes({
  from: { opacity: 0, transform: "translateX(16px)" },
  to: { opacity: 1, transform: "none" },
});

// A value that just changed settles into place, so a redraw points at what moved rather than
// flashing the whole board.
const tick = stylex.keyframes({
  from: { opacity: 0.2, transform: "translateY(-5px) scale(0.9)" },
  to: { opacity: 1, transform: "none" },
});

const drop = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(-4px) scale(0.98)" },
  to: { opacity: 1, transform: "none" },
});

export const entrance = stylex.create({
  /** The sign-in page: seen rarely, so slow and showy. */
  page: {
    animationName: { default: rise, "@media (prefers-reduced-motion: reduce)": fadeIn },
    animationDuration: "800ms",
    animationTimingFunction: motion.easeOut,
    animationFillMode: "both",
  },
  /** The board: opened many times a day, so quick and close to rest. */
  board: {
    "--rise": "10px",
    animationName: { default: rise, "@media (prefers-reduced-motion: reduce)": fadeIn },
    animationDuration: "320ms",
    animationTimingFunction: motion.easeOut,
    animationFillMode: "backwards",
  },
  /** Something the PM just opened, like an issue list: barely moves, done in a blink. */
  reveal: {
    "--rise": "6px",
    animationName: { default: rise, "@media (prefers-reduced-motion: reduce)": fadeIn },
    animationDuration: "220ms",
    animationTimingFunction: motion.easeOut,
    animationFillMode: "backwards",
  },
  /**
   * A panel opening: docked at the side of a wide board it slides in from the edge it's docked
   * to; stacked above the people it rises like a revealed list.
   */
  panel: {
    "--rise": "6px",
    animationName: {
      default: rise,
      "@media (min-width: 1080px) and (prefers-reduced-motion: no-preference)": slideIn,
      "@media (prefers-reduced-motion: reduce)": fadeIn,
    },
    animationDuration: "240ms",
    animationTimingFunction: motion.easeOut,
    animationFillMode: "backwards",
  },
  /**
   * A number or icon whose value just changed. Key the element by its value so it replays only
   * when the value does.
   */
  changed: {
    animationName: { default: tick, "@media (prefers-reduced-motion: reduce)": fadeIn },
    animationDuration: "260ms",
    animationTimingFunction: motion.easeOut,
  },
  /** A menu dropping open from its trigger. */
  menu: {
    animationName: { default: drop, "@media (prefers-reduced-motion: reduce)": fadeIn },
    animationDuration: "160ms",
    animationTimingFunction: motion.easeOut,
  },
  delay: (ms: number) => ({ animationDelay: `${ms}ms` }),
});
