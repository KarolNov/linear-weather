import * as stylex from "@stylexjs/stylex";
import {
  Avatar,
  Badge,
  Button,
  Card,
  LinkButton,
  Logo,
  Sky,
  type Weather,
  WeatherIcon,
  weatherLabels,
} from "ui";
import { colors, fonts, radii, space } from "ui/tokens.stylex";
import type { Viewer } from "./App";

export interface BoardShellProps {
  viewer: Viewer;
  /** Showing the mocked Avengers workspace: offer a way out instead of signing out. */
  demo?: boolean;
}

/** The signed-in frame the matrix will live in (#7). */
export function BoardShell({ viewer, demo }: BoardShellProps) {
  const who = (
    <>
      <Avatar name={viewer.name} src={viewer.avatarUrl} size={30} />
      <span {...stylex.props(styles.viewerName)}>{viewer.name}</span>
    </>
  );
  return (
    <Sky time="dawn">
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.brand)}>
          <Logo />
          <Badge>{viewer.organization.name}</Badge>
        </div>
        {/* The name is hidden on phones, so the label says who is signed in there too. */}
        {demo ? (
          <div {...stylex.props(styles.account)}>
            {who}
            <LinkButton href="/" variant="quiet">
              Exit demo
            </LinkButton>
          </div>
        ) : (
          <form
            method="post"
            action="/auth/logout"
            aria-label={`Signed in as ${viewer.name}`}
            {...stylex.props(styles.account)}
          >
            {who}
            <Button type="submit" variant="quiet">
              Sign out
            </Button>
          </form>
        )}
      </header>

      <main {...stylex.props(styles.main)}>
        <Card as="section" xstyle={styles.welcome}>
          <WeatherIcon weather="partly" size={56} label="" />
          <h1 {...stylex.props(styles.title)}>Your team's forecast is on its way</h1>
          <p {...stylex.props(styles.lead)}>
            Soon you'll pick a team here and see each person's issues sorted into a matrix, with
            their weather now and for the weeks ahead.
          </p>
        </Card>

        <div {...stylex.props(styles.legends)}>
          <Card as="section">
            <h2 {...stylex.props(styles.heading)}>How we sort issues</h2>
            <div {...stylex.props(styles.matrix)}>
              {quadrants.map((q) => (
                <div key={q.name} {...stylex.props(styles.quadrant, q.style)}>
                  <span {...stylex.props(styles.quadrantName)}>{q.name}</span>
                  <span {...stylex.props(styles.quadrantRule)}>{q.rule}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card as="section">
            <h2 {...stylex.props(styles.heading)}>Reading the weather</h2>
            <ul {...stylex.props(styles.weatherList)}>
              {weatherLegend.map(([weather, meaning]) => (
                <li key={weather} {...stylex.props(styles.weatherItem)}>
                  <WeatherIcon weather={weather} size={30} label="" />
                  <span>
                    <strong>{weatherLabels[weather]}</strong>
                    <span {...stylex.props(styles.muted)}> · {meaning}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </main>
    </Sky>
  );
}

const weatherLegend: [Weather, string][] = [
  ["sun", "lighter urgent load than the team average"],
  ["partly", "about average"],
  ["rain", "busier than most"],
  ["storm", "overloaded, time to rebalance"],
  ["fog", "lots of work with no due date"],
];

const styles = stylex.create({
  header: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.sm,
    paddingBlock: space.sm,
    paddingInline: { default: space.md, "@media (min-width: 768px)": space.xl },
    backgroundColor: "rgba(255, 255, 255, 0.55)",
    backdropFilter: "blur(16px) saturate(1.4)",
    borderBottom: `1px solid ${colors.border}`,
  },
  // Wraps so the org badge drops below the logo on phones instead of running off the edge.
  brand: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.sm, minWidth: 0 },
  account: { display: "flex", alignItems: "center", gap: space.sm, margin: 0 },
  viewerName: {
    fontWeight: 600,
    fontSize: "0.9375rem",
    display: { default: "none", "@media (min-width: 640px)": "inline" },
  },
  main: {
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
    maxWidth: "1120px",
    marginInline: "auto",
    paddingBlock: space.xl,
    paddingInline: { default: space.md, "@media (min-width: 768px)": space.xl },
  },
  welcome: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.sm,
    padding: { default: space.lg, "@media (min-width: 768px)": space.xl },
  },
  title: {
    fontFamily: fonts.display,
    fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)",
    fontWeight: 800,
    letterSpacing: "-0.02em",
    lineHeight: 1.1,
  },
  lead: { maxWidth: "40rem", fontSize: "1.0625rem", lineHeight: 1.55, color: colors.inkMuted },
  legends: {
    display: "grid",
    gridTemplateColumns: { default: "1fr", "@media (min-width: 860px)": "1fr 1fr" },
    gap: space.lg,
  },
  heading: {
    fontFamily: fonts.display,
    fontSize: "1.125rem",
    fontWeight: 700,
    marginBottom: space.md,
  },
  matrix: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: space.xs },
  quadrant: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
    padding: space.md,
    borderRadius: radii.md,
    minHeight: "92px",
  },
  quadrantName: { fontFamily: fonts.display, fontWeight: 800, fontSize: "1.0625rem" },
  quadrantRule: { fontSize: "0.8125rem", lineHeight: 1.4, opacity: 0.85 },
  doQ: {
    color: "#fff",
    backgroundImage: `linear-gradient(135deg, ${colors.storm}, #e8507a)`,
  },
  scheduleQ: {
    color: "#fff",
    backgroundImage: `linear-gradient(135deg, ${colors.rain}, #7fb2ff)`,
  },
  delegateQ: {
    color: "#6b4300",
    backgroundImage: `linear-gradient(135deg, ${colors.focus}, #ffb35c)`,
  },
  dropQ: {
    color: "#4a5066",
    backgroundColor: `color-mix(in srgb, ${colors.fog} 25%, transparent)`,
  },
  weatherList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
  },
  weatherItem: { display: "flex", alignItems: "center", gap: space.sm, fontSize: "0.9375rem" },
  muted: { color: colors.inkMuted },
});

const quadrants = [
  { name: "Do", rule: "Important and urgent", style: styles.doQ },
  { name: "Schedule", rule: "Important, not urgent yet", style: styles.scheduleQ },
  { name: "Delegate", rule: "Urgent, less important", style: styles.delegateQ },
  { name: "Drop", rule: "Neither, question it", style: styles.dropQ },
];
