import * as stylex from "@stylexjs/stylex";
import { useEffect, useMemo, useState } from "preact/hooks";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  type Glyph,
  Logo,
  Sky,
  VisuallyHidden,
  WeatherIcon,
  weatherLabels,
} from "ui";
import { boardSky, colors, fonts, radii, space } from "ui/tokens.stylex";
import {
  type Board,
  type BoardError,
  type BoardIssue,
  type CalendarDate,
  describeCapacity,
  describeTimeOff,
  type Person,
  type PersonMatrix as PersonMatrixData,
  QUADRANTS,
  type Quadrant,
  type Rules,
  runningLate,
  type Suggestion,
  type TeamBoardData,
  type Weather as TeamWeather,
  type TimeOff,
  teamBoard,
  total,
  type Viewer,
} from "./board";
import { entrance } from "./motion";
import { applyMoves, boardClient, describeMoves } from "./mutations";
import { PersonMatrix } from "./PersonMatrix";
import { quadrantFill, quadrantInfo } from "./quadrants";
import { RebalancePanel } from "./RebalancePanel";
import { RulesPanel } from "./RulesPanel";
import { TeamPicker } from "./TeamPicker";
import { skyFor, weatherIcon } from "./weather";

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
  // The team and its people as the last change left them. Each change answers with the whole
  // team's board, so it's replaced rather than patched. Kept here because the sky follows it.
  const [shown, setShown] = useState(() => board && { team: board.team, people: board.people });
  return (
    <Sky time="dawn" weather={shown?.team ? skyFor(shown.team.weather.kind) : undefined}>
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
        {board && shown ? (
          <TeamBoard board={board} shown={shown} onAnswer={setShown} demo={demo} />
        ) : (
          <BoardUnavailable error={boardError} />
        )}

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

type Shown = Pick<Board, "team" | "people">;

function TeamBoard({
  board: { teams, today },
  shown: { team, people },
  onAnswer,
  demo,
}: {
  board: Board;
  shown: Shown;
  /** Shows a saved change's answer: the team's whole board. */
  onAnswer: (answer: Shown) => void;
  demo?: boolean;
}) {
  const client = useMemo(() => boardClient(Boolean(demo)), [demo]);
  const [editingRules, setEditingRules] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);
  // Issues whose move hasn't answered yet.
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const markPending = (issueIds: string[], on: boolean) =>
    setPending((current) => {
      const next = new Set(current);
      for (const id of issueIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  // Today's moves are being made, one after another.
  const [applying, setApplying] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Read out by screen readers; the board redrawing is the visible answer.
  const [status, setStatus] = useState("");
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

  // The issue whose move button gets the keyboard back once the board redraws. A moved card
  // lands in another quadrant's list, so the button that had focus is gone.
  const [refocus, setRefocus] = useState<string | null>(null);
  useEffect(() => {
    if (refocus === null) return;
    setRefocus(null);
    // Only when the move left focus nowhere, so a PM who went on to something else keeps it.
    if (document.activeElement && document.activeElement !== document.body) return;
    document.querySelector<HTMLElement>(`[data-move-trigger="${CSS.escape(refocus)}"]`)?.focus();
  }, [refocus]);

  /** Redraws the board from a saved change's answer; false, with a notice, when it can't. */
  const showAnswer = (answer: TeamBoardData | null) => {
    // A move answers with its issue's team, which isn't this one if the issue changed team in
    // Linear since the page loaded.
    if (!answer || answer.id !== team?.id) {
      setFailure("That's saved, but the board can't show it yet. Reload the page to see it.");
      return false;
    }
    onAnswer(teamBoard(answer));
    return true;
  };
  const place = async (issue: BoardIssue, to: Quadrant | null) => {
    markPending([issue.id], true);
    setFailure(null);
    const result = await client.placeIssue(issue.id, to);
    markPending([issue.id], false);
    setRefocus(issue.id);
    if (!result.ok) {
      setFailure(`Couldn't move ${issue.identifier}. ${result.message}`);
      return;
    }
    if (!showAnswer(result.team)) return;
    setStatus(
      to
        ? `Moved ${issue.identifier} to ${quadrantInfo[to].name}.`
        : `${issue.identifier} is back with the rules.`,
    );
  };
  // A failed move's message sits below the panel, out of sight: take the keyboard, and the
  // view, there. An earlier move's word in the status would contradict it.
  const [failureFocus, setFailureFocus] = useState(false);
  useEffect(() => {
    if (!failureFocus) return;
    setFailureFocus(false);
    document.getElementById("board-failure")?.focus();
  }, [failureFocus]);
  const moveFailed = (message: string) => {
    setStatus("");
    setFailure(message);
    setFailureFocus(true);
  };
  // A suggestion's button goes once its move is made, so give the keyboard to the panel once the
  // board has redrawn, unless the PM went on to something else.
  const [panelFocus, setPanelFocus] = useState(false);
  useEffect(() => {
    if (!panelFocus) return;
    setPanelFocus(false);
    if (document.activeElement && document.activeElement !== document.body) return;
    document.getElementById("rebalance-heading")?.focus();
  }, [panelFocus]);
  const refocusPanel = () => setPanelFocus(true);
  /** Makes moves in Linear, one at a time; `all` when they're today's, made after a yes. */
  const makeMoves = async (moves: Suggestion[], all: boolean) => {
    if (!team) return;
    const ids = moves.map(({ issue }) => issue.id);
    // Only today's moves lock the panel; a single move answering mustn't unlock it mid-run.
    if (all) setApplying(true);
    markPending(ids, true);
    setFailure(null);
    const applied = await applyMoves(client, team.id, moves);
    markPending(ids, false);
    if (all) setApplying(false);
    const said = describeMoves(moves, applied);
    if ("failure" in said) {
      // The board as read again after the failure, else the newest one an answer carried; with
      // neither, the one shown stays.
      if (applied.team) showAnswer(applied.team);
      moveFailed(said.failure);
      return;
    }
    if (showAnswer(applied.team)) setStatus(said.status);
    refocusPanel();
  };
  /** Sets how much of a full-time week someone works; their weather and the rebalance follow. */
  const changeCapacity = async (person: Person, factor: number) => {
    if (!team) return;
    markPending([person.id], true);
    setFailure(null);
    const result = await client.setCapacity(team.id, person.id, factor);
    markPending([person.id], false);
    if (!result.ok) {
      setFailure(`Couldn't change ${person.name}'s capacity. ${result.message}`);
      return;
    }
    if (showAnswer(result.team)) {
      setStatus(`${person.name} works ${describeCapacity(factor).toLowerCase()} now.`);
    }
  };
  /** Marks someone away; their weather, the forecast and the rebalance follow. */
  const addTimeOff = async (person: Person, startsOn: CalendarDate, endsOn: CalendarDate) => {
    if (!team) return false;
    markPending([person.id], true);
    setFailure(null);
    const result = await client.addTimeOff(team.id, person.id, startsOn, endsOn);
    markPending([person.id], false);
    if (!result.ok) {
      setFailure(`Couldn't add ${person.name}'s time off. ${result.message}`);
      return false;
    }
    if (showAnswer(result.team)) {
      setStatus(`${person.name} is away ${describeTimeOff({ startsOn, endsOn })}.`);
    }
    return true;
  };
  const removeTimeOff = async (person: Person, timeOff: TimeOff) => {
    if (!team) return;
    markPending([person.id], true);
    setFailure(null);
    const result = await client.removeTimeOff(team.id, person.id, timeOff.id);
    markPending([person.id], false);
    if (!result.ok) {
      setFailure(`Couldn't take back ${person.name}'s time off. ${result.message}`);
      return;
    }
    if (showAnswer(result.team)) {
      setStatus(`${person.name} isn't away ${describeTimeOff(timeOff)} any more.`);
    }
  };
  const saveRules = async (rules: Rules) => {
    if (!team) throw new Error("no team to save rules for");
    setFailure(null);
    const result = await client.updateRules(team.id, rules);
    if (result.ok && showAnswer(result.team)) {
      setStatus("Rules saved. The board is sorted by them now.");
    }
    return result;
  };

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
  const moves = team.rebalanceNow.length + team.rebalanceForecast.length;
  return (
    <section aria-labelledby="team-name" {...stylex.props(styles.board)}>
      <div {...stylex.props(styles.boardHeader, entrance.board)}>
        <div>
          <h1 id="team-name" {...stylex.props(styles.title, styles.onSky)}>
            {team.name}
          </h1>
          <p {...stylex.props(styles.onSky, styles.subtitle)}>
            {withIssues.length === 0
              ? "Nobody on this team has open issues."
              : "Open issues by person, soonest due first."}
          </p>
          <TeamForecast weather={team.weather} />
          {team.backlogRot.rotting && <BacklogRotFlag reason={team.backlogRot.reason} />}
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
          <Button
            variant="quiet"
            aria-expanded={rebalancing}
            aria-controls={rebalancing ? "rebalance-panel" : undefined}
            onClick={() => setRebalancing(!rebalancing)}
            xstyle={styles.expandAll}
          >
            {moves === 0 ? "Rebalance" : `Rebalance · ${moves}`}
          </Button>
          <Button
            variant="quiet"
            aria-expanded={editingRules}
            aria-controls={editingRules ? "rules-panel" : undefined}
            onClick={() => setEditingRules(!editingRules)}
            xstyle={styles.expandAll}
          >
            Sorting rules
          </Button>
          {teams.length > 1 && <TeamPicker teams={teams} selected={team} demo={demo} />}
        </div>
      </div>
      {editingRules && (
        <div id="rules-panel">
          <RulesPanel
            // A fresh form for each team, starting from its saved rules.
            key={team.id}
            teamName={team.name}
            rules={team.rules}
            onSave={saveRules}
            onClose={() => setEditingRules(false)}
          />
        </div>
      )}
      {rebalancing && (
        <div id="rebalance-panel">
          <RebalancePanel
            teamName={team.name}
            rebalanceNow={team.rebalanceNow}
            rebalanceForecast={team.rebalanceForecast}
            runningLate={runningLate(people)}
            pending={pending}
            applying={applying}
            onReassign={(move) => makeMoves([move], false)}
            onApplyNow={(moves) => makeMoves(moves, true)}
            onClose={() => setRebalancing(false)}
          />
        </div>
      )}
      {failure && (
        <div id="board-failure" tabIndex={-1} {...stylex.props(styles.failureFocus)}>
          <Alert weather="rain">
            <span {...stylex.props(styles.failure)}>
              {failure}
              <Button variant="quiet" onClick={() => setFailure(null)} xstyle={styles.expandAll}>
                Dismiss
              </Button>
            </span>
          </Alert>
        </div>
      )}
      <VisuallyHidden>
        <span role="status">{status}</span>
      </VisuallyHidden>
      <div {...stylex.props(styles.people)}>
        {people.map((person, i) => (
          <PersonMatrix
            key={keyOf(person)}
            person={person}
            today={today}
            expanded={expanded.has(keyOf(person))}
            onExpandedChange={(open) => setOne(keyOf(person), open)}
            onPlace={place}
            onCapacityChange={(factor) =>
              person.assignee && changeCapacity(person.assignee, factor)
            }
            onAddTimeOff={async (startsOn, endsOn) =>
              person.assignee ? addTimeOff(person.assignee, startsOn, endsOn) : false
            }
            onRemoveTimeOff={(timeOff) =>
              person.assignee && removeTimeOff(person.assignee, timeOff)
            }
            pending={pending}
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

/** The team's weather now and why, on a chip of its own so it reads on every sky. */
function TeamForecast({ weather }: { weather: TeamWeather }) {
  const icon = weatherIcon[weather.kind];
  return (
    <p {...stylex.props(styles.forecast)}>
      <WeatherIcon weather={icon} size={28} label={`Team weather: ${weatherLabels[icon]}.`} />
      <span>{weather.reason}</span>
    </p>
  );
}

/**
 * Too much of the team's open work sits in Drop: a backlog filling with things nobody means to
 * do. Shown only past the team's alert, on a chip like the weather's so it reads on every sky.
 */
function BacklogRotFlag({ reason }: { reason: string }) {
  return (
    <p {...stylex.props(styles.forecast, styles.rot)}>
      <WeatherIcon weather="fog" size={28} label="" />
      <span>
        <strong>Backlog rot:</strong> {reason}. Close what nobody will do, or give it a priority or
        a due date.
      </span>
    </p>
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

const weatherLegend: [Glyph, string][] = [
  ["sun", "lighter urgent load than the team average"],
  ["partly", "about average"],
  ["rain", "busier than most"],
  ["storm", "overloaded or overdue, time to rebalance"],
  ["fog", "can't tell yet: undated or unestimated work"],
  ["away", "on time off: out of the average, and their urgent work needs a taker"],
];

const styles = stylex.create({
  failureFocus: { outline: "none" },
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
  // Straight on the sky, so its colour follows the sky's, easing with it.
  onSky: { color: boardSky.text, transitionProperty: "color", transitionDuration: "1.6s" },
  // Muted by fading whatever colour the sky gives text.
  subtitle: { opacity: 0.8 },
  forecast: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    marginTop: space.sm,
    paddingBlock: space.xxs,
    paddingInlineStart: space.xxs,
    paddingInlineEnd: space.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    backdropFilter: "blur(16px)",
    fontSize: "0.9375rem",
    fontWeight: 600,
    lineHeight: 1.3,
  },
  // Its own line under the weather, edged in the fog it warns of.
  rot: {
    display: "flex",
    width: "fit-content",
    maxWidth: "100%",
    borderColor: colors.fog,
    borderWidth: 2,
    fontWeight: 500,
  },
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
  failure: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
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
