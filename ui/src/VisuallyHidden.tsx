import * as stylex from "@stylexjs/stylex";
import type { ComponentChildren } from "preact";

/** Text for screen readers only, e.g. what an icon or a terse label means. */
export function VisuallyHidden({ children }: { children: ComponentChildren }) {
  return <span {...stylex.props(styles.hidden)}>{children}</span>;
}

const styles = stylex.create({
  // Clipped to nothing rather than display:none, so it's still read out.
  hidden: {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "-1px",
    padding: 0,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
});
