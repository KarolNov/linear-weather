import * as stylex from "@stylexjs/stylex";
import type { ComponentChildren } from "preact";
import { Card, LinkButton, Logo, Sky, type Weather, WeatherIcon } from "ui";
import { colors, fonts, radii, space } from "ui/tokens.stylex";
import { enterPage as enter, PAGE_STEP as STEP } from "./motion";
import { SignInCtas } from "./SignInCtas";

// The public pages, for anyone deciding whether to let the app into their Linear workspace:
// what it does (/about, the OAuth app's homepage) and what it keeps (/privacy). Both are static,
// so the web Worker renders them without asking the server who is signed in.

export type InfoPageName = "about" | "privacy";

export const REPOSITORY = "https://github.com/KarolNov/linear-weather";
const ISSUES = `${REPOSITORY}/issues`;

/** When the privacy page last changed. Update it with the page. */
const PRIVACY_UPDATED = "20 November 2026";

export function InfoPage({ page, signedIn }: { page: InfoPageName; signedIn?: boolean }) {
  return (
    <Sky time="sunset">
      <div {...stylex.props(styles.page)}>
        <header {...stylex.props(styles.header, enter(0))}>
          <a href="/" {...stylex.props(styles.home)} aria-label="Weather Forecast for Linear, home">
            <Logo onSky compactOnPhones />
          </a>
          <nav aria-label="Pages" {...stylex.props(styles.nav)}>
            <NavLink href="/about" current={page === "about"}>
              About
            </NavLink>
            <NavLink href="/privacy" current={page === "privacy"}>
              Privacy
            </NavLink>
          </nav>
        </header>

        <main {...stylex.props(enter(STEP))}>
          {page === "about" ? <About signedIn={signedIn} /> : <Privacy />}
        </main>

        <Footer />
      </div>
    </Sky>
  );
}

function About({ signedIn }: { signedIn?: boolean }) {
  return (
    <>
      <section {...stylex.props(styles.hero)}>
        <h1 {...stylex.props(styles.title)}>A weather report for your team's workload.</h1>
        <p {...stylex.props(styles.lead)}>
          Weather Forecast reads your Linear team's issues and shows, person by person, who is
          overloaded now and who is about to be, so you can hand work over before the storm.
        </p>
        {/* Signing in again would replace the session, so whoever is signed in goes back. */}
        {signedIn ? (
          <div>
            <LinkButton href="/" size="lg">
              Open your board
              <span aria-hidden="true">→</span>
            </LinkButton>
          </div>
        ) : (
          <SignInCtas />
        )}
      </section>

      <Card xstyle={styles.prose}>
        <h2 {...stylex.props(styles.h2)}>How it works</h2>
        <ul {...stylex.props(styles.features)}>
          <Feature weather="partly" title="Every issue in a quadrant">
            Each person's open issues are sorted into an Eisenhower matrix: Do, Schedule, Delegate
            and Drop. By default an issue is important from Medium priority up, and urgent when it's
            due within 14 days or overdue. Each team can change those rules, and a PM can place any
            issue by hand.
          </Feature>
          <Feature weather="storm" title="Weather now">
            Each person's urgent work is compared with their fair share: the team's average, scaled
            by how much of a week they work. Sun means a light load, a storm means far more than
            their share. Someone on time off is away, and their urgent work still counts.
          </Feature>
          <Feature weather="rain" title="A forecast for the weeks ahead">
            Due dates say when work will turn urgent, so each person gets a forecast for the next
            weeks, with the reason for each change ("3 High-priority issues become urgent"). Work
            without a due date shows up as fog.
          </Feature>
          <Feature weather="sun" title="Rebalance">
            The app suggests who should hand which issue to whom, to clear today's storms and the
            ones coming. One click reassigns the issue in Linear.
          </Feature>
        </ul>

        <h2 {...stylex.props(styles.h2)}>What it asks Linear for</h2>
        <p {...stylex.props(styles.p)}>
          You sign in with your own Linear account, so the app sees exactly the teams and issues you
          can see in Linear, and no more.
        </p>
        <ul {...stylex.props(styles.list)}>
          <li>
            <strong>Read</strong>: your teams, their members, and their open issues, to draw the
            board.
          </li>
          <li>
            <strong>Write</strong>: only to reassign an issue, when you click{" "}
            <strong>Hand over</strong> or <strong>Make all of today's moves</strong>. The app
            changes nothing else in Linear.
          </li>
        </ul>
        <p {...stylex.props(styles.p)}>
          Linear also tells the app when issues change, so open boards update live. What the app
          keeps is on the{" "}
          <a href="/privacy" {...stylex.props(styles.link)}>
            privacy page
          </a>
          .
        </p>

        <h2 {...stylex.props(styles.h2)}>Who makes it</h2>
        <p {...stylex.props(styles.p)}>
          It's a side project by one developer, built in the open on Linear's GraphQL API and
          Cloudflare Workers. It's free, and it isn't made or endorsed by Linear. Questions, bugs
          and ideas go to{" "}
          <a href={ISSUES} {...stylex.props(styles.link)}>
            GitHub issues
          </a>
          .
        </p>
      </Card>
    </>
  );
}

function Feature({
  weather,
  title,
  children,
}: {
  weather: Weather;
  title: string;
  children: ComponentChildren;
}) {
  return (
    <li {...stylex.props(styles.feature)}>
      <span {...stylex.props(styles.featureIcon)}>
        <WeatherIcon weather={weather} size={28} label="" />
      </span>
      <div>
        <h3 {...stylex.props(styles.h3)}>{title}</h3>
        <p {...stylex.props(styles.p)}>{children}</p>
      </div>
    </li>
  );
}

function Privacy() {
  return (
    <>
      <section {...stylex.props(styles.hero)}>
        <h1 {...stylex.props(styles.title)}>Privacy</h1>
        <p {...stylex.props(styles.lead)}>
          Your issues stay in Linear. The app reads them when you open the board, and keeps only
          your sign-in and the board's own settings.
        </p>
      </section>

      <Card xstyle={styles.prose}>
        <p {...stylex.props(styles.updated)}>Last updated {PRIVACY_UPDATED}</p>

        <h2 {...stylex.props(styles.h2)}>What the app reads from Linear</h2>
        <p {...stylex.props(styles.p)}>
          Your name, avatar and workspace name; your teams and their members, with each member's
          Linear status (its emoji, text and when it ends) and timezone; and the open issues of the
          team you're looking at: titles, assignees, priorities, estimates, due dates, states,
          cycles, and which issues block others and whether those are still open. It reads them each
          time you open or refresh the board, and doesn't store them.
        </p>

        <h2 {...stylex.props(styles.h2)}>What the app keeps</h2>
        <ul {...stylex.props(styles.list)}>
          <li>
            <strong>Your sign-in.</strong> The Linear tokens from signing in, kept on the server
            (Cloudflare KV) and never sent to your browser. Your browser holds only a random session
            cookie. Tokens are deleted 30 days after you sign in or the app last renews them with
            Linear, or at once when you sign out, which also revokes them with Linear.
          </li>
          <li>
            <strong>The board's settings</strong>, which anyone on the team sees (Cloudflare D1):
            each team's sorting rules (including which Linear status texts, such as "On vacation",
            count as away), the issues placed in a quadrant by hand, how much of a week each person
            works, and their time off. They're stored against Linear's ids for the team, issue or
            person, with no names, titles or other issue content.
          </li>
        </ul>
        <p {...stylex.props(styles.p)}>
          When Linear tells the app an issue changed, the app passes on only that something changed,
          so open boards reload. It keeps nothing from those messages.
        </p>

        <h2 {...stylex.props(styles.h2)}>Cookies</h2>
        <ul {...stylex.props(styles.list)}>
          <li>
            <code {...stylex.props(styles.code)}>lw_session</code> keeps you signed in.
          </li>
          <li>
            <code {...stylex.props(styles.code)}>lw_oauth</code> lasts only while you sign in, to
            check the answer from Linear is the one you asked for.
          </li>
          <li>
            <code {...stylex.props(styles.code)}>lw_demo</code> remembers what you change in the
            demo, in your browser only.
          </li>
        </ul>
        <p {...stylex.props(styles.p)}>No analytics, no ads, no tracking.</p>

        <h2 {...stylex.props(styles.h2)}>Who else sees it</h2>
        <p {...stylex.props(styles.p)}>
          Nobody. The app doesn't sell or share data. It runs on Cloudflare Workers, which keep
          request logs for a few days so problems can be fixed.
        </p>

        <h2 {...stylex.props(styles.h2)}>Removing your data</h2>
        <p {...stylex.props(styles.p)}>
          Sign out to delete your tokens, or revoke the app in Linear's settings under your
          authorized applications. To remove a team's board settings, open an issue on{" "}
          <a href={ISSUES} {...stylex.props(styles.link)}>
            GitHub
          </a>{" "}
          and they'll be deleted.
        </p>
      </Card>
    </>
  );
}

function NavLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: ComponentChildren;
}) {
  return (
    <a
      href={href}
      aria-current={current ? "page" : undefined}
      {...stylex.props(styles.navLink, current && styles.navLinkCurrent)}
    >
      {children}
    </a>
  );
}

/** Links to the public pages, for the sign-in page and the pages themselves. */
export function Footer() {
  return (
    <footer {...stylex.props(styles.footer)}>
      <a href="/about" {...stylex.props(styles.footerLink)}>
        About
      </a>
      <a href="/privacy" {...stylex.props(styles.footerLink)}>
        Privacy
      </a>
      <a href={REPOSITORY} {...stylex.props(styles.footerLink)}>
        GitHub
      </a>
    </footer>
  );
}

const WIDE = "@media (min-width: 720px)";

const styles = stylex.create({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: { default: space.xl, [WIDE]: space.xxl },
    maxWidth: "760px",
    minHeight: "100dvh",
    marginInline: "auto",
    paddingBlock: space.lg,
    paddingInline: space.md,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  home: { color: "inherit", textDecoration: "none" },
  nav: { display: "flex", gap: space.xxs },
  navLink: {
    paddingBlock: space.xxs,
    paddingInline: space.sm,
    borderRadius: radii.pill,
    color: colors.inkOnSkyMuted,
    fontWeight: 500,
    textDecoration: "none",
    backgroundColor: { default: "transparent", ":hover": colors.surfaceOnSky },
  },
  navLinkCurrent: { color: colors.inkOnSky, backgroundColor: colors.surfaceOnSky },

  hero: {
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
    marginBottom: { default: space.xl, [WIDE]: space.xxl },
  },
  title: {
    fontFamily: fonts.display,
    fontSize: "clamp(2rem, 6vw, 3rem)",
    fontWeight: 800,
    lineHeight: 1.08,
    letterSpacing: "-0.025em",
    textWrap: "balance",
    color: colors.inkOnSky,
    textShadow: "0 2px 24px rgba(31, 23, 71, 0.35)",
  },
  lead: {
    maxWidth: "36rem",
    fontSize: "1.125rem",
    lineHeight: 1.55,
    color: colors.inkOnSkyMuted,
  },

  prose: {
    padding: { default: space.lg, [WIDE]: space.xl },
    lineHeight: 1.6,
  },
  h2: {
    fontFamily: fonts.display,
    fontSize: "1.25rem",
    fontWeight: 700,
    letterSpacing: "-0.01em",
    marginTop: { default: space.xl, ":first-child": 0 },
    marginBottom: space.sm,
  },
  h3: { fontSize: "1rem", fontWeight: 600, marginBottom: space.xxs },
  p: { color: colors.ink, marginBottom: { default: space.sm, ":last-child": 0 } },
  updated: { fontSize: "0.875rem", color: colors.inkMuted, marginBottom: space.lg },
  list: {
    margin: 0,
    marginBottom: space.sm,
    paddingInlineStart: "1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
  },
  features: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
  },
  feature: { display: "flex", alignItems: "flex-start", gap: space.md },
  featureIcon: {
    display: "inline-flex",
    flexShrink: 0,
    padding: space.xs,
    borderRadius: radii.md,
    backgroundColor: colors.subtle,
  },
  link: { color: colors.accentStrong, textUnderlineOffset: "2px" },
  code: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "0.875em",
    paddingInline: "4px",
    borderRadius: radii.sm,
    backgroundColor: colors.subtle,
  },

  footer: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.md,
    marginTop: "auto",
    fontSize: "0.875rem",
  },
  // The footer sits on the gold end of the sunset, where light ink fades.
  footerLink: {
    color: colors.inkOnSunsetGold,
    fontWeight: 500,
    textDecoration: { default: "none", ":hover": "underline" },
  },
});
