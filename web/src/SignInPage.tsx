import * as stylex from "@stylexjs/stylex";
import { Alert, Avatar, Card, LinkButton, Logo, Sky, type Weather, WeatherIcon } from "ui";
import { colors, fonts, radii, space } from "ui/tokens.stylex";
import { entrance } from "./motion";

export interface SignInPageProps {
  linearUnavailable?: boolean;
  authError?: string;
}

export function SignInPage({ linearUnavailable, authError }: SignInPageProps) {
  return (
    <Sky time="sunset">
      <div {...stylex.props(styles.page)}>
        <header {...stylex.props(enter(0))}>
          <Logo onSky />
        </header>

        <main {...stylex.props(styles.hero)}>
          <section {...stylex.props(styles.pitch)}>
            <h1 {...stylex.props(styles.title, enter(STEP))}>
              See the storm before it hits your team.
            </h1>
            <p {...stylex.props(styles.lead, enter(STEP * 2))}>
              See who on your team is overloaded now, and who is about to be. We sort everyone's
              issues into Do, Schedule, Delegate and Drop, and turn them into a forecast.
            </p>

            <div {...stylex.props(enter(STEP * 3))}>
              {linearUnavailable ? (
                <Alert onSky>Couldn't reach Linear just now. Please reload in a minute.</Alert>
              ) : (
                <div {...stylex.props(styles.actions)}>
                  {authError && (
                    <Alert weather="rain" onSky>
                      {signInErrorMessage(authError)}
                    </Alert>
                  )}
                  <div {...stylex.props(styles.ctas)}>
                    <LinkButton href="/auth/login" size="lg">
                      Sign in with Linear
                      <span aria-hidden="true">→</span>
                    </LinkButton>
                    {/* Nick Fury's board for a mocked Avengers team, for trying it without a
                        Linear workspace. */}
                    <LinkButton href="/?demo=true" variant="glass" size="lg">
                      Explore the demo
                    </LinkButton>
                  </div>
                  <p {...stylex.props(styles.fineprint)}>
                    You'll see exactly the teams and issues you can see in Linear.
                  </p>
                </div>
              )}
            </div>
          </section>

          <ForecastPreview />
        </main>
      </div>
    </Sky>
  );
}

// The original Avengers, as their PM sees them. The demo shows you their board as Nick Fury.
const sampleTeam: { name: string; weather: Weather; summary: string; week: Weather[] }[] = [
  {
    name: "Tony Stark",
    weather: "storm",
    summary: "11 urgent, 3 overdue",
    week: ["storm", "storm", "rain", "partly"],
  },
  {
    name: "Steve Rogers",
    weather: "sun",
    summary: "2 urgent",
    week: ["sun", "sun", "partly", "sun"],
  },
  {
    name: "Natasha Romanoff",
    weather: "partly",
    summary: "4 urgent",
    week: ["partly", "rain", "partly", "sun"],
  },
  {
    name: "Bruce Banner",
    weather: "rain",
    summary: "6 urgent",
    week: ["rain", "storm", "rain", "partly"],
  },
  {
    name: "Thor Odinson",
    weather: "fog",
    summary: "7 with no due date",
    week: ["fog", "fog", "partly", "sun"],
  },
  {
    name: "Clint Barton",
    weather: "sun",
    summary: "1 urgent",
    week: ["sun", "partly", "sun", "sun"],
  },
];

/** A sample team, to show what the board will tell you once you're signed in. */
function ForecastPreview() {
  return (
    <Card variant="glass" as="section" xstyle={[styles.preview, enter(STEP * 4)]}>
      <div {...stylex.props(styles.previewHeader)}>
        <h2 {...stylex.props(styles.previewTitle)}>Team forecast</h2>
        <span {...stylex.props(styles.weeks)} aria-hidden="true">
          <span>Now</span>
          <span>W2</span>
          <span>W3</span>
          <span>W4</span>
        </span>
      </div>
      <ul {...stylex.props(styles.rows)} aria-label="Example forecast for the Avengers">
        {sampleTeam.map((person, row) => (
          <li key={person.name} {...stylex.props(styles.row, enter(STEP * 5 + row * ROW_STEP))}>
            <Avatar name={person.name} size={36} />
            <span {...stylex.props(styles.person)}>
              <span {...stylex.props(styles.personName)}>{person.name}</span>
              <span {...stylex.props(styles.personSummary)}>{person.summary}</span>
            </span>
            <span {...stylex.props(styles.week)}>
              {person.week.map((weather, i) => (
                <span key={i} {...stylex.props(styles.day, i === 0 && styles.today)}>
                  <WeatherIcon weather={weather} size={i === 0 ? 30 : 22} />
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function signInErrorMessage(code: string): string {
  if (code === "access_denied") return "Sign-in was cancelled.";
  return "Signing in with Linear failed. Please try again.";
}

// The page settles in piece by piece, top to bottom, then the example forecast row by row.
// People see this page rarely, so a little choreography is welcome.
// Milliseconds between one piece of the page starting to appear and the next.
const STEP = 150;
const ROW_STEP = 100;

const enter = (delayMs: number) => [entrance.page, entrance.delay(delayMs)];

const WIDE = "@media (min-width: 960px)";
// Wide enough for the two sign-in buttons to sit side by side.
const ROOMY = "@media (min-width: 480px)";
// One column, but too wide for left-aligned content not to leave an empty half: centre it all.
const TABLET = "@media (min-width: 640px) and (max-width: 959.98px)";

const styles = stylex.create({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: { default: space.xl, [WIDE]: space.xxl },
    maxWidth: "1120px",
    minHeight: "100dvh",
    marginInline: "auto",
    paddingBlock: space.lg,
    paddingInline: { default: space.md, [WIDE]: space.xl },
  },
  hero: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr)", [WIDE]: "minmax(0, 1.1fr) minmax(0, 1fr)" },
    alignItems: "center",
    gap: { default: space.xl, [WIDE]: space.xxl },
    flexGrow: 1,
    paddingBottom: "18vmin",
  },
  pitch: {
    display: "flex",
    flexDirection: "column",
    alignItems: { default: "stretch", [TABLET]: "center" },
    gap: space.lg,
    textAlign: { default: "start", [TABLET]: "center" },
  },
  title: {
    fontFamily: fonts.display,
    fontSize: "clamp(2.25rem, 5.5vw, 3.75rem)",
    fontWeight: 800,
    lineHeight: 1.04,
    letterSpacing: "-0.025em",
    textWrap: "balance",
    textShadow: "0 2px 24px rgba(31, 23, 71, 0.35)",
  },
  lead: {
    maxWidth: "34rem",
    fontSize: "1.125rem",
    lineHeight: 1.55,
    color: colors.inkOnSkyMuted,
  },
  // On a phone the buttons stack at full width; side by side they'd wrap into a ragged pair.
  actions: {
    display: "flex",
    flexDirection: "column",
    alignItems: { default: "stretch", [ROOMY]: "flex-start" },
    gap: space.sm,
  },
  ctas: {
    display: "flex",
    flexDirection: { default: "column", [ROOMY]: "row" },
    gap: space.sm,
    marginTop: space.xs,
  },
  fineprint: {
    fontSize: "0.875rem",
    color: colors.inkOnSkyMuted,
    textShadow: "0 1px 8px rgba(31, 23, 71, 0.4)",
  },

  preview: {
    width: "100%",
    maxWidth: "460px",
    justifySelf: { default: "stretch", [TABLET]: "center", [WIDE]: "end" },
    // Tinted with the sky's dusk rather than light glass, so the white text stays readable even
    // where the card sits over the bright orange and gold end of the sunset.
    backgroundColor: "rgba(31, 23, 71, 0.42)",
  },
  previewHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  previewTitle: { fontFamily: fonts.display, fontSize: "1.125rem", fontWeight: 700 },
  weeks: {
    display: "grid",
    gridTemplateColumns: "38px repeat(3, 30px)",
    gap: space.xxs,
    textAlign: "center",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.inkOnSkyMuted,
  },
  rows: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    padding: space.xs,
    borderRadius: radii.md,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  person: { display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 },
  personName: {
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  personSummary: { fontSize: "0.8125rem", color: colors.inkOnSkyMuted },
  week: {
    display: "grid",
    gridTemplateColumns: "38px repeat(3, 30px)",
    alignItems: "center",
    justifyItems: "center",
    gap: space.xxs,
  },
  day: { display: "inline-flex", opacity: 0.85 },
  today: {
    opacity: 1,
    padding: "3px",
    borderRadius: radii.sm,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },
});
