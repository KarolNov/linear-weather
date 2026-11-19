import * as stylex from "@stylexjs/stylex";
import type { ComponentChildren, JSX } from "preact";
import { Icon, type IconName } from "./Icon";
import { colors, fonts, media, motion, radii, shadows, space } from "./tokens.stylex";

/**
 * - primary: solid accent, for the one thing a view is for.
 * - secondary: white with a hairline, for everything else; reads on every sky.
 * - ghost: no surface until hovered, for actions next to content (dismiss, cancel).
 * - glass: see-through, for sitting on the dark sign-in sky.
 */
type Variant = "primary" | "secondary" | "ghost" | "glass";
type Size = "sm" | "md" | "lg";

interface StyleProps {
  variant?: Variant;
  size?: Size;
  /** A glyph before the label. */
  icon?: IconName;
  /** A glyph after the label, e.g. a chevron for something that opens. */
  iconEnd?: IconName;
  /** A toggle that's on, such as the button of a panel that's open: it takes an accent tint. */
  selected?: boolean;
  children: ComponentChildren;
  xstyle?: stylex.StyleXStyles;
}

export type ButtonProps = StyleProps &
  Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "class" | "style" | "size">;

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconEnd,
  selected,
  children,
  xstyle,
  ...rest
}: ButtonProps) {
  // A disabled button drops its hover and press responses, which would suggest it works.
  // Preact accepts a signal here, and a signal object is truthy even when its value is false.
  const isDisabled = typeof rest.disabled === "object" ? rest.disabled?.value : rest.disabled;
  const disabled = Boolean(isDisabled) && [styles.disabled, disabledStyles[variant]];
  return (
    <button
      type="button"
      {...rest}
      {...stylex.props(...buttonStyles(variant, size, selected), disabled, xstyle)}
    >
      <Content icon={icon} iconEnd={iconEnd} size={size}>
        {children}
      </Content>
    </button>
  );
}

export type LinkButtonProps = StyleProps &
  Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "class" | "style" | "size">;

/** A link that looks like a button, for navigation such as starting the sign-in flow. */
export function LinkButton({
  variant = "primary",
  size = "md",
  icon,
  iconEnd,
  selected,
  children,
  xstyle,
  ...rest
}: LinkButtonProps) {
  return (
    <a {...rest} {...stylex.props(...buttonStyles(variant, size, selected), xstyle)}>
      <Content icon={icon} iconEnd={iconEnd} size={size}>
        {children}
      </Content>
    </a>
  );
}

function Content({
  icon,
  iconEnd,
  size,
  children,
}: Pick<StyleProps, "icon" | "iconEnd" | "children"> & { size: Size }) {
  const glyph = size === "lg" ? 18 : size === "sm" ? 14 : 16;
  return (
    <>
      {icon && <Icon name={icon} size={glyph} xstyle={styles.glyph} />}
      {children}
      {iconEnd && <Icon name={iconEnd} size={glyph} xstyle={styles.glyph} />}
    </>
  );
}

/** A small count inside a button or chip, e.g. how many moves there are. */
export function Count({ children }: { children: ComponentChildren }) {
  return <span {...stylex.props(styles.count)}>{children}</span>;
}

const buttonStyles = (variant: Variant, size: Size, selected?: boolean) =>
  [styles.base, styles[variant], sizes[size], selected && styles.selected] as const;

const styles = stylex.create({
  base: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    fontFamily: fonts.body,
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    // The press answers at once with a strong ease-out; colours ease under the pointer.
    transitionProperty: "transform, box-shadow, background-color, color, border-color",
    transitionDuration: `${motion.press}, ${motion.hover}, ${motion.hover}, ${motion.hover}, ${motion.hover}`,
    transitionTimingFunction: `${motion.easeOut}, ease, ease, ease, ease`,
    transform: { default: null, ":active": "scale(0.98)" },
    outline: { default: "none", ":focus-visible": `2px solid ${colors.focus}` },
    outlineOffset: "1px",
  },
  primary: {
    color: "#fff",
    backgroundColor: {
      default: colors.accent,
      [media.hover]: { default: colors.accent, ":hover": colors.accentStrong },
    },
    borderColor: colors.accentStrong,
    boxShadow: {
      default: shadows.button,
      [media.hover]: { default: shadows.button, ":hover": shadows.buttonHover },
    },
  },
  secondary: {
    color: colors.ink,
    backgroundColor: {
      default: colors.control,
      [media.hover]: { default: colors.control, ":hover": colors.controlHover },
    },
    borderColor: colors.controlBorder,
    boxShadow: {
      default: shadows.control,
      [media.hover]: { default: shadows.control, ":hover": shadows.controlHover },
    },
  },
  ghost: {
    color: colors.inkMuted,
    backgroundColor: {
      default: "transparent",
      [media.hover]: { default: "transparent", ":hover": colors.hover },
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
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.18)",
  },
  // An accent tint and border: on, without shouting.
  selected: {
    color: colors.onSelected,
    backgroundColor: {
      default: colors.selected,
      [media.hover]: { default: colors.selected, ":hover": "#e4e7f8" },
    },
    borderColor: "rgba(94, 106, 210, 0.35)",
    // StyleX merges whole properties, so this replaces the variant's hover shadows too.
    boxShadow: shadows.control,
  },
  disabled: { cursor: "not-allowed", opacity: 0.55, transform: null },
  glyph: { opacity: 0.7 },
  count: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "1.5em",
    height: "1.5em",
    paddingInline: "0.4em",
    marginInlineEnd: "-0.35em",
    borderRadius: "4px",
    backgroundColor: "color-mix(in srgb, currentColor 10%, transparent)",
    fontSize: "0.6875rem",
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
  },
});

// Heights rather than paddings, so a button lines up with a select or chip beside it. On touch
// screens each is at least a thumb tall.
const sizes = stylex.create({
  sm: {
    height: { default: "26px", [media.touch]: "40px" },
    paddingInline: space.xs,
    gap: "6px",
    fontSize: "0.75rem",
  },
  md: {
    height: { default: "30px", [media.touch]: "44px" },
    paddingInline: "10px",
    gap: "6px",
    fontSize: "0.8125rem",
  },
  lg: { height: "40px", paddingInline: space.md, fontSize: "0.875rem" },
});

// Same values as each variant's resting state, without the hover condition.
const disabledStyles = stylex.create({
  primary: { backgroundColor: colors.accent, boxShadow: shadows.button },
  secondary: { backgroundColor: colors.control, boxShadow: shadows.control },
  ghost: { backgroundColor: "transparent" },
  glass: { backgroundColor: colors.surfaceOnSky },
});
