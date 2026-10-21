import * as stylex from "@stylexjs/stylex";
import { useState } from "preact/hooks";
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
import {
  type Board,
  type BoardError,
  type PersonMatrix as PersonMatrixData,
  QUADRANTS,
  total,
  type Viewer,
} from "./board";
import { entrance } from "./motion";
import { PersonMatrix } from "./PersonMatrix";
import { quadrantFill, quadrantInfo } from "./quadrants";
import { TeamPicker } from "./TeamPicker";

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
          <Logo compactOnPhones />
          {/* Phones keep the header to one row; the workspace is the least needed there. */}
          <span {...stylex.props(styles.workspace)}>
            <Badge>{viewer.organization.name}</Badge>
          </span>
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

        <div {...stylex.props(styles.legends, entrance.board, entrance.delay(LEGEND_DELAY_MS))}>
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
  // Lists start shut so the matrices are what you see first. Keyed by assignee id.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const keyOf = (person: PersonMatrixData) => person.assignee?.id ?? "unassigned";
  const withIssues = people.filter((p) => total(p.matrix) > 0).map(keyOf);
  const allExpanded = withIssues.length > 0 && withIssues.every((key) => expanded.has(key));
  const setOne = (key: string, open: boolean) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });

  if (!team) {
    return (
      <Card as="section" xstyle={styles.notice}>
        <WeatherIcon weather="fog" size={56} label="" />
        <h1 {...stylex.props(styles.title)}>No teams to show</h1>
        <p {...stylex.props(styles.lead)}>
          Your Linear account can't see any teams yet. Join or create one in Linear, then come back.
        </p>
      </Card>
    );
  }
  return (
    <section aria-labelledby="team-name" {...stylex.props(styles.board)}>
      <div {...stylex.props(styles.boardHeader, entrance.board)}>
        <div>
          <h1 id="team-name" {...stylex.props(styles.title)}>
            {team.name}
          </h1>
          <p {...stylex.props(styles.muted)}>
            {withIssues.length === 0
              ? "Nobody on this team has open issues."
              : "Open issues by person, soonest due first."}
          </p>
        </div>
        <div {...stylex.props(styles.controls)}>
          {withIssues.length > 0 && (
            <Button
              variant="quiet"
              onClick={() => setExpanded(new Set(allExpanded ? [] : withIssues))}
              xstyle={styles.expandAll}
            >
              {allExpanded ? "Collapse all" : "Expand all"}
            </Button>
          )}
          {teams.length > 1 && <TeamPicker teams={teams} selected={team} demo={demo} />}
        </div>
      </div>
      <div {...stylex.props(styles.people)}>
        {people.map((person, i) => (
          <PersonMatrix
            key={keyOf(person)}
            person={person}
            today={today}
            expanded={expanded.has(keyOf(person))}
            onExpandedChange={(open) => setOne(keyOf(person), open)}
            xstyle={[
              entrance.board,
              entrance.delay(PERSON_DELAY_MS + Math.min(i, MAX_STAGGERED) * PERSON_STEP_MS),
            ]}
          />
        ))}
      </div>
    </section>
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

// The board settles in like the sign-in page, but quicker, since a PM opens it often: the
// team's name, then each person's matrix in reading order, then the legend.
const PERSON_DELAY_MS = 80;
const PERSON_STEP_MS = 50;
const MAX_STAGGERED = 8;
const LEGEND_DELAY_MS = PERSON_DELAY_MS + (MAX_STAGGERED + 1) * PERSON_STEP_MS;

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
    gap: space.sm,
    paddingBlock: space.sm,
    paddingInline: { default: space.md, "@media (min-width: 768px)": space.xl },
    backgroundColor: "rgba(255, 255, 255, 0.55)",
    backdropFilter: "blur(16px) saturate(1.4)",
    borderBottom: `1px solid ${colors.border}`,
  },
  brand: { display: "flex", alignItems: "center", gap: space.sm, minWidth: 0 },
  workspace: { display: { default: "none", "@media (min-width: 640px)": "inline-flex" } },
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
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
    alignItems: "start",
    gap: space.md,
  },
  controls: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  expandAll: { paddingBlock: "8px", fontSize: "0.875rem" },
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
