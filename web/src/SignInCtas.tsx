import * as stylex from "@stylexjs/stylex";
import { LinkButton } from "ui";
import { space } from "ui/tokens.stylex";

/** Wide enough for the two buttons to sit side by side. */
const ROOMY = "@media (min-width: 480px)";

/** Sign in, or try the demo: the sign-in page's and /about's way in. */
export function SignInCtas({ xstyle }: { xstyle?: stylex.StyleXStyles }) {
  return (
    <div {...stylex.props(styles.ctas, xstyle)}>
      <LinkButton href="/auth/login" size="lg">
        Sign in with Linear
        <span aria-hidden="true">→</span>
      </LinkButton>
      {/* Nick Fury's board for a mocked Avengers team, for trying it without a Linear
          workspace. */}
      <LinkButton href="/?demo=true" variant="glass" size="lg">
        Explore the demo
      </LinkButton>
    </div>
  );
}

const styles = stylex.create({
  // On a phone the buttons stack at full width; side by side they'd wrap into a ragged pair.
  ctas: {
    display: "flex",
    flexDirection: { default: "column", [ROOMY]: "row" },
    gap: space.sm,
  },
});
