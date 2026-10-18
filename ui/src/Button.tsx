import * as stylex from "@stylexjs/stylex";
import type { ComponentChildren, JSX } from "preact";
import { colors, fonts, gradients, media, motion, radii, shadows, space } from "./tokens.stylex";

type Variant = "primary" | "glass" | "quiet";
type Size = "md" | "lg";

interface StyleProps {
  variant?: Variant;
  size?: Size;
  children: ComponentChildren;
  xstyle?: stylex.StyleXStyles;
}

export type ButtonProps = StyleProps &
  Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "class" | "style" | "size">;

export function Button({ variant = "primary", size = "md", xstyle, ...rest }: ButtonProps) {
  // A disabled button drops its hover and press responses, which would suggest it works.
  // Preact accepts a signal here, and a signal object is truthy even when its value is false.
  const isDisabled = typeof rest.disabled === "object" ? rest.disabled?.value : rest.disabled;
  const disabled = Boolean(isDisabled) && [styles.disabled, disabledStyles[variant]];
  return (
    <button
      type="button"
      {...rest}
      {...stylex.props(...buttonStyles(variant, size), disabled, xstyle)}
    />
  );
}

export type LinkButtonProps = StyleProps &
  Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "class" | "style" | "size">;

/** A link that looks like a button, for navigation such as starting the sign-in flow. */
export function LinkButton({ variant = "primary", size = "md", xstyle, ...rest }: LinkButtonProps) {
  return <a {...rest} {...stylex.props(...buttonStyles(variant, size), xstyle)} />;
}

const buttonStyles = (variant: Variant, size: Size) =>
  [styles.base, styles[variant], size === "lg" && styles.large] as const;

// The quiet variant's resting background, shared with its disabled look.
const QUIET_BACKGROUND = "rgba(255, 255, 255, 0.55)";

const styles = stylex.create({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    paddingBlock: "10px",
    paddingInline: space.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    fontFamily: fonts.body,
    fontSize: "0.9375rem",
    fontWeight: 600,
    lineHeight: 1.2,
    textDecoration: "none",
    whiteSpace: "nowrap",
    cursor: "pointer",
    // The press responds with a strong ease-out; hover colour changes with a plain ease.
    transitionProperty: "transform, box-shadow, background-color, filter",
    transitionDuration: "160ms, 200ms, 200ms, 200ms",
    transitionTimingFunction: `${motion.easeOut}, ease, ease, ease`,
    transform: { default: null, ":active": "scale(0.97)" },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focus}` },
    outlineOffset: "2px",
  },
  primary: {
    color: "#fff",
    backgroundImage: gradients.accent,
    // Paint the gradient under the transparent border too; by default it starts inside the
    // border and repeats beneath it, leaving a sliver of the start colour on the far edge.
    backgroundOrigin: "border-box",
    boxShadow: {
      default: shadows.button,
      [media.hover]: {
        default: shadows.button,
        ":hover": "0 12px 26px -8px rgba(232, 93, 42, 0.85)",
      },
    },
    filter: {
      default: null,
      [media.hover]: { default: null, ":hover": "saturate(1.1) brightness(1.04)" },
    },
  },
  glass: {
    color: colors.inkOnSky,
    backgroundColor: {
      default: colors.surfaceOnSky,
      [media.hover]: { default: colors.surfaceOnSky, ":hover": "rgba(255, 255, 255, 0.24)" },
    },
    borderColor: colors.borderOnSky,
    backdropFilter: "blur(12px)",
  },
  quiet: {
    color: colors.ink,
    backgroundColor: {
      default: QUIET_BACKGROUND,
      [media.hover]: { default: QUIET_BACKGROUND, ":hover": colors.surfaceStrong },
    },
    borderColor: colors.border,
  },
  large: { paddingBlock: "14px", paddingInline: space.lg, fontSize: "1.0625rem" },
  disabled: { cursor: "not-allowed", opacity: 0.7, transform: null },
});

// Same values as each variant's resting state, without the hover condition.
const disabledStyles = stylex.create({
  primary: { boxShadow: shadows.button, filter: null },
  glass: { backgroundColor: colors.surfaceOnSky },
  quiet: { backgroundColor: QUIET_BACKGROUND },
});
