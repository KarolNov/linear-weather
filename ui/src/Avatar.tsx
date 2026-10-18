import * as stylex from "@stylexjs/stylex";
import { colors, gradients } from "./tokens.stylex";

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
}

/** A person's picture, or their initials on a sunset when they have none. */
export function Avatar({ name, src, size = 32 }: AvatarProps) {
  const dimensions = { width: size, height: size };
  if (src) return <img src={src} alt="" {...dimensions} {...stylex.props(styles.avatar)} />;
  return (
    <span aria-hidden="true" {...stylex.props(styles.avatar, styles.initials, styles.size(size))}>
      {initials(name)}
    </span>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? `${words[0]?.[0]}${words.at(-1)?.[0]}` : (words[0]?.slice(0, 2) ?? "");
  return letters.toUpperCase();
}

const styles = stylex.create({
  avatar: {
    display: "inline-block",
    flexShrink: 0,
    borderRadius: "50%",
    objectFit: "cover",
    boxShadow: "0 0 0 2px rgba(255, 255, 255, 0.85)",
  },
  initials: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: colors.inkOnSky,
    backgroundImage: gradients.accent,
    fontWeight: 700,
    letterSpacing: "0.02em",
  },
  size: (size: number) => ({ width: size, height: size, fontSize: size * 0.4 }),
});
