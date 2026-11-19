import * as stylex from "@stylexjs/stylex";
import { colors } from "./tokens.stylex";

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
}

/** A person's picture, or their initials on a flat colour of their own when they have none. */
export function Avatar({ name, src, size = 32 }: AvatarProps) {
  const dimensions = { width: size, height: size };
  if (src) return <img src={src} alt="" {...dimensions} {...stylex.props(styles.avatar)} />;
  return (
    <span
      aria-hidden="true"
      {...stylex.props(styles.avatar, styles.initials, styles.size(size), hues[hueOf(name)])}
    >
      {initials(name)}
    </span>
  );
}

/** The same colour for the same name, every time. */
function hueOf(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return hash % hues.length;
}

// Muted mid-tones that keep white initials readable. Spelled out: StyleX compiles them ahead.
const hueStyles = stylex.create({
  h0: { backgroundColor: "#5e6ad2" },
  h1: { backgroundColor: "#4c9a8a" },
  h2: { backgroundColor: "#c0646b" },
  h3: { backgroundColor: "#b9853c" },
  h4: { backgroundColor: "#7a6bc4" },
  h5: { backgroundColor: "#4a8bc2" },
  h6: { backgroundColor: "#7d828b" },
});
const hues = [
  hueStyles.h0,
  hueStyles.h1,
  hueStyles.h2,
  hueStyles.h3,
  hueStyles.h4,
  hueStyles.h5,
  hueStyles.h6,
];

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
  },
  initials: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: colors.inkOnSky,
    fontWeight: 600,
  },
  size: (size: number) => ({ width: size, height: size, fontSize: size * 0.38 }),
});
