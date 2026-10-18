import * as stylex from "@stylexjs/stylex";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Logo,
  Sky,
  type Weather,
  WeatherIcon,
  weatherLabels,
} from "ui";
import { colors, fonts, radii, space } from "ui/tokens.stylex";
import type { Viewer } from "./App";
import { type Board, type BoardError, QUADRANTS } from "./board";
import { PersonMatrix } from "./PersonMatrix";
import { quadrantFill, quadrantInfo } from "./quadrants";

export interface BoardShellProps {
  viewer: Viewer;
  /** Null when it couldn't load; `boardError` says why. */
  board: Board | null;
  boardError?: BoardError;
  /** Showing the mocked Avengers workspace: offer a way out instead of signing out. */
  demo?: boolean;
}

/** The signed-in board: pick a team, see each person's matrix. */
export function BoardShell({ viewer, board, boardError, demo }: BoardShellProps) {
  return (
    <Sky time="dawn">
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.brand)}>
          <Logo />
          <Badge>{viewer.organization.name}</Badge>
        </div>
        {/* The name is hidden on phones, so the label says who is signed in there too. */}
        {/* The demo has no session to end, so its button just leaves for the real sign-in. */}
        <form
          method={demo ? "get" : "post"}
          action={demo ? "/" : "/auth/logout"}
          aria-label={`Signed in as ${viewer.name}`}
          {...stylex.props(styles.account)}
        >
          <Avatar name={viewer.name} src={viewer.avatarUrl} size={30} />
          <span {...stylex.props(styles.viewerName)}>{viewer.name}</span>
          <Button type="submit" variant="quiet">
            {demo ? "Exit demo" : "Sign out"}
          </Button>
        </form>
      </header>

      <main {...stylex.props(styles.main)}>
        {board ? <TeamBoard board={board} demo={demo} /> : <BoardUnavailable error={boardError} />}

        <div {...stylex.props(styles.legends)}>
          <Card as="section">
            <h2 {...stylex.props(styles.heading)}>How we sort issues</h2>
            <div {...stylex.props(styles.matrix)}>
              {QUADRANTS.map((q) => (
                <div key={q} {...stylex.props(styles.quadrant, quadrantFill[q])}>
                  <span {...stylex.props(styles.quadrantName)}>{quadrantInfo[q].name}</span>
                  <span {...stylex.props(styles.quadrantRule)}>{quadrantInfo[q].rule}</span>
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

function TeamBoard({ board, demo }: { board: Board; demo?: boolean }) {
  const { team, teams, people, today } = board;
  if (!team) {
    return (
      <Card as="section" xstyle={styles.notice}>
        <WeatherIcon weather="fog" size={56} label="" />
        <h1 {...stylex.props(styles.title)}>No teams to show</h1>
        <p {...stylex.props(styles.lead)}>
          Your Linear account isn't on any team yet. Join one in Linear, then come back.
        </p>
      </Card>
    );
  }
  return (
    <section aria-labelledby="team-name" {...stylex.props(styles.board)}>
      <div {...stylex.props(styles.boardHeader)}>
        <div>
          <h1 id="team-name" {...stylex.props(styles.title)}>
            {team.name}
          </h1>
          <p {...stylex.props(styles.muted)}>
            {people.length === 0
              ? "Nobody on this team has open issues."
              : "Open issues by person, soonest due first."}
          </p>
        </div>
        {teams.length > 1 && <TeamPicker teams={teams} selected={team.id} demo={demo} />}
      </div>
      <div {...stylex.props(styles.people)}>
        {people.map((matrix) => (
          <PersonMatrix key={matrix.assignee?.id ?? "unassigned"} matrix={matrix} today={today} />
        ))}
      </div>
    </section>
  );
}

/**
 * A plain GET form, so picking a team is a link the PM can share or bookmark, and it works
 * before the page hydrates. Once it has, choosing a team submits straight away.
 */
function TeamPicker({
  teams,
  selected,
  demo,
}: {
  teams: Board["teams"];
  selected: string;
  demo?: boolean;
}) {
  return (
    <form method="get" action="/" {...stylex.props(styles.picker)}>
      {demo && <input type="hidden" name="demo" value="true" />}
      <label for="team" {...stylex.props(styles.pickerLabel)}>
        Team
      </label>
      <select
        id="team"
        name="team"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        {...stylex.props(styles.select)}
      >
        {teams.map((t) => (
          <option key={t.id} value={t.id} selected={t.id === selected}>
            {t.name} ({t.key})
          </option>
        ))}
      </select>
      <noscript>
        <Button type="submit" variant="quiet">
          Show
        </Button>
      </noscript>
    </form>
  );
}

function BoardUnavailable({ error }: { error?: BoardError }) {
  const resetAt = error?.kind === "rate_limited" && error.resetAt ? new Date(error.resetAt) : null;
  return (
    <Card as="section" xstyle={styles.notice}>
      <WeatherIcon weather="storm" size={56} label="" />
      <h1 {...stylex.props(styles.title)}>Couldn't load your team</h1>
      <p {...stylex.props(styles.lead)}>
        {error?.kind === "rate_limited"
          ? `We've asked Linear for too much in the last hour. Please reload ${
              resetAt ? `after ${resetAt.toISOString().slice(11, 16)} UTC` : "in a few minutes"
            }.`
          : "Linear didn't answer just now. Please reload in a minute."}
      </p>
    </Card>
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
    maxWidth: "1440px",
    marginInline: "auto",
    paddingBlock: space.xl,
    paddingInline: { default: space.md, "@media (min-width: 768px)": space.xl },
  },
  notice: {
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
  board: { display: "flex", flexDirection: "column", gap: space.lg },
  boardHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space.md,
  },
  // Side by side, as many as fit; each card only as tall as its own list.
  people: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
    alignItems: "start",
    gap: space.md,
  },
  picker: { display: "flex", alignItems: "center", gap: space.xs, margin: 0 },
  pickerLabel: { fontSize: "0.875rem", fontWeight: 600, color: colors.inkMuted },
  select: {
    font: "inherit",
    fontSize: "0.9375rem",
    fontWeight: 600,
    color: colors.ink,
    paddingBlock: space.xs,
    paddingInlineStart: space.sm,
    paddingInlineEnd: space.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
    maxWidth: "100%",
    cursor: "pointer",
  },
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
