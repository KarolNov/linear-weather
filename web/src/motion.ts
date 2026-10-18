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
  /** The board: opened many times a day, so quicker and closer to rest. */
  board: {
    "--rise": "12px",
    animationName: { default: rise, "@media (prefers-reduced-motion: reduce)": fadeIn },
    animationDuration: "450ms",
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
  /** A menu dropping open from its trigger. */
  menu: {
    animationName: { default: drop, "@media (prefers-reduced-motion: reduce)": fadeIn },
    animationDuration: "160ms",
    animationTimingFunction: motion.easeOut,
  },
  delay: (ms: number) => ({ animationDelay: `${ms}ms` }),
});
