import * as stylex from "@stylexjs/stylex";
import type { ComponentChildren, JSX } from "preact";
import { Icon, type IconName } from "./Icon";
import { colors, fonts, gradients, media, motion, radii, shadows, space } from "./tokens.stylex";

/**
 * - primary: the sunrise, for the one thing a view is for.
 * - secondary: a frosted cloud, for everything else; reads on every sky.
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
  /** A toggle that's on, such as the button of a panel that's open: it turns night ink. */
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
    borderRadius: radii.pill,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    fontFamily: fonts.body,
    fontWeight: 600,
    lineHeight: 1,
    letterSpacing: "-0.005em",
    textDecoration: "none",
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    // The press answers at once with a strong ease-out; colours ease under the pointer.
    transitionProperty: "transform, box-shadow, background-color, color, border-color, filter",
    transitionDuration: `${motion.press}, ${motion.hover}, ${motion.hover}, ${motion.hover}, ${motion.hover}, ${motion.hover}`,
    transitionTimingFunction: `${motion.easeOut}, ease, ease, ease, ease, ease`,
    transform: { default: null, ":active": "scale(0.97)" },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focus}` },
    outlineOffset: "2px",
  },
  primary: {
    color: "#fff",
    backgroundImage: gradients.sunrise,
    // Paint the gradient under the transparent border too; by default it starts inside the
    // border and repeats beneath it, leaving a sliver of the start colour on the far edge.
    backgroundOrigin: "border-box",
    textShadow: "0 1px 0 rgba(150, 40, 10, 0.25)",
    boxShadow: {
      default: shadows.button,
      [media.hover]: { default: shadows.button, ":hover": shadows.buttonHover },
    },
    filter: {
      default: null,
      [media.hover]: { default: null, ":hover": "saturate(1.08) brightness(1.04)" },
    },
  },
  secondary: {
    color: colors.ink,
    backgroundColor: {
      default: colors.control,
      [media.hover]: { default: colors.control, ":hover": colors.controlHover },
    },
    borderColor: colors.controlBorder,
    backdropFilter: "blur(12px) saturate(1.4)",
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
  // Night ink with a faint top light, like the storm sky: unmistakably on, on any sky.
  selected: {
    color: colors.onSelected,
    backgroundColor: {
      default: colors.selected,
      [media.hover]: { default: colors.selected, ":hover": "#2c2850" },
    },
    borderColor: colors.selected,
    // StyleX merges whole properties, so these replace the variant's hover shadows too.
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 4px 12px -4px rgba(29, 26, 51, 0.45)",
    filter: null,
  },
  disabled: { cursor: "not-allowed", opacity: 0.55, transform: null },
  glyph: { opacity: 0.85 },
  count: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "1.5em",
    height: "1.5em",
    paddingInline: "0.4em",
    marginInlineEnd: "-0.35em",
    borderRadius: radii.pill,
    backgroundColor: "color-mix(in srgb, currentColor 14%, transparent)",
    fontSize: "0.75rem",
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
  },
});

// Heights rather than paddings, so a button lines up with a select or chip beside it. On touch
// screens each is at least a thumb tall.
const sizes = stylex.create({
  sm: {
    height: { default: "30px", [media.touch]: "40px" },
    paddingInline: space.sm,
    gap: "6px",
    fontSize: "0.8125rem",
  },
  md: {
    height: { default: "36px", [media.touch]: "44px" },
    paddingInline: "14px",
    fontSize: "0.875rem",
  },
  lg: { height: "50px", paddingInline: space.lg, fontSize: "1.0625rem" },
});

// Same values as each variant's resting state, without the hover condition.
const disabledStyles = stylex.create({
  primary: { boxShadow: shadows.button, filter: null },
  secondary: { backgroundColor: colors.control, boxShadow: shadows.control },
  ghost: { backgroundColor: "transparent" },
  glass: { backgroundColor: colors.surfaceOnSky },
});
