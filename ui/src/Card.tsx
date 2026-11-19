import * as stylex from "@stylexjs/stylex";
import type { ComponentChildren } from "preact";
import { colors, radii, shadows, space } from "./tokens.stylex";

export interface CardProps {
  /** "glass" is frosted, for sitting on a sky; "solid" is for content on the board. */
  variant?: "glass" | "solid";
  as?: "div" | "section" | "article";
  children: ComponentChildren;
  xstyle?: stylex.StyleXStyles;
}

export function Card({ variant = "solid", as: Tag = "div", children, xstyle }: CardProps) {
  return <Tag {...stylex.props(styles.base, styles[variant], xstyle)}>{children}</Tag>;
}

const styles = stylex.create({
  base: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderStyle: "solid",
    padding: { default: space.md, "@media (min-width: 640px)": space.lg },
  },
  glass: {
    color: colors.inkOnSky,
    backgroundColor: colors.surfaceOnSky,
    borderColor: colors.borderOnSky,
    backdropFilter: "blur(20px) saturate(1.3)",
    boxShadow: shadows.floating,
  },
  solid: {
    color: colors.ink,
    backgroundColor: colors.surface,
    borderColor: "rgba(255, 255, 255, 0.7)",
    backdropFilter: "blur(16px) saturate(1.3)",
    boxShadow: shadows.card,
  },
});
