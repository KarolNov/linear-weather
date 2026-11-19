import * as stylex from "@stylexjs/stylex";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  Count,
  type Glyph,
  Logo,
  Sky,
  VisuallyHidden,
  WeatherIcon,
  weatherLabels,
} from "ui";
import { boardSky, colors, radii, space } from "ui/tokens.stylex";
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
import { listenForUpdates } from "./live";
import { entrance } from "./motion";
import { applyMoves, boardClient, describeMoves } from "./mutations";
import { PersonMatrix } from "./PersonMatrix";
import { dot, quadrantDot, quadrantInfo } from "./quadrants";
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
  const [shown, setShown] = useState<Shown | null>(
    () => board && { team: board.team, people: board.people, today: board.today },
  );
  const show = (answer: Answer) => setShown((current) => current && { ...current, ...answer });
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
          <Avatar name={viewer.name} src={viewer.avatarUrl} size={24} />
          <span {...stylex.props(styles.viewerName)}>{viewer.name}</span>
          <Button type="submit">{demo ? "Exit demo" : "Sign out"}</Button>
        </form>
      </header>

      <main {...stylex.props(styles.main)}>
        {board && shown ? (
          <TeamBoard board={board} shown={shown} onAnswer={show} demo={demo} />
        ) : (
          <BoardUnavailable error={boardError} />
        )}

        <div {...stylex.props(styles.legends, entrance.board, entrance.delay(LEGEND_DELAY_MS))}>
          <Card as="section">
            <h2 {...stylex.props(styles.heading)}>How we sort issues</h2>
            <div {...stylex.props(styles.matrix)}>
              {QUADRANTS.map((q) => (
                <div key={q} {...stylex.props(styles.quadrant)}>
                  <span {...stylex.props(styles.quadrantName)}>
                    <span aria-hidden="true" {...stylex.props(dot.dot, quadrantDot[q])} />
                    {quadrantInfo[q].name}
                  </span>
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
                  <WeatherIcon weather={weather} size={20} label="" />
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

/** The board as it reads now: after the last change, or the last live update. */
type Shown = Pick<Board, "team" | "people" | "today">;
/** A change's answer, or a live update, which also says what day it is now. */
type Answer = Pick<Board, "team" | "people"> & { today?: Board["today"] };

function TeamBoard({
  board: { teams },
  shown: { team, people, today },
  onAnswer,
  demo,
}: {
  board: Board;
  shown: Shown;
  /** Shows a saved change's answer, or a live update: the team's whole board. */
  onAnswer: (answer: Answer) => void;
  demo?: boolean;
}) {
  const client = useMemo(() => boardClient(Boolean(demo)), [demo]);
  // The board follows changes made in Linear or on other boards, and moves on as days pass. The
  // demo has no webhooks, and its changes live in this browser's cookie, which a long-lived
  // stream would read only once, so it stays as its own changes leave it.
  const showUpdate = useRef(onAnswer);
  showUpdate.current = onAnswer;
  const teamId = team?.id;
  useEffect(() => {
    if (demo || !teamId) return;
    return listenForUpdates(teamId, {
      update: ({ today, team }) => showUpdate.current({ today, ...teamBoard(team) }),
    });
  }, [demo, teamId]);
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
      changeFailed(`Couldn't move ${issue.identifier}. ${result.message}`);
      return;
    }
    if (!showAnswer(result.team)) return;
    setStatus(
      to
        ? `Moved ${issue.identifier} to ${quadrantInfo[to].name}.`
        : `${issue.identifier} is back with the rules.`,
    );
  };
  // A failed change's message sits above the board, often out of sight of the card or panel it
  // came from: take the keyboard, and the view, there. An earlier change's word in the status
  // would contradict it.
  const [failureFocus, setFailureFocus] = useState(false);
  useEffect(() => {
    if (!failureFocus) return;
    setFailureFocus(false);
    document.getElementById("board-failure")?.focus();
  }, [failureFocus]);
  const changeFailed = (message: string) => {
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
      changeFailed(said.failure);
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
      changeFailed(`Couldn't change ${person.name}'s capacity. ${result.message}`);
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
      changeFailed(`Couldn't add ${person.name}'s time off. ${result.message}`);
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
      changeFailed(`Couldn't take back ${person.name}'s time off. ${result.message}`);
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
        {/* One toolbar row: which team first, since it sets everything else, then what to do.
            On phones the secondary actions keep only their icons, so the row doesn't wrap. */}
        <div {...stylex.props(styles.controls)}>
          {teams.length > 1 && (
            <div {...stylex.props(styles.pickerSlot)}>
              <TeamPicker teams={teams} selected={team} demo={demo} />
            </div>
          )}
          {withIssues.length > 0 && (
            <Button
              icon={allExpanded ? "collapse" : "expand"}
              title={allExpanded ? "Collapse all" : "Expand all"}
              onClick={() => setExpanded(new Set(allExpanded ? [] : withIssues))}
              xstyle={styles.iconOnPhone}
            >
              <span {...stylex.props(styles.labelOnPhone)}>
                {allExpanded ? "Collapse all" : "Expand all"}
              </span>
            </Button>
          )}
          <Button
            icon="balance"
            selected={rebalancing}
            aria-expanded={rebalancing}
            aria-controls={rebalancing ? "rebalance-panel" : undefined}
            onClick={() => setRebalancing(!rebalancing)}
          >
            Rebalance
            {moves > 0 && (
              <>
                <VisuallyHidden>:</VisuallyHidden>
                <Count>{moves}</Count>
              </>
            )}
          </Button>
          <Button
            icon="sliders"
            title="Sorting rules"
            selected={editingRules}
            aria-expanded={editingRules}
            aria-controls={editingRules ? "rules-panel" : undefined}
            onClick={() => setEditingRules(!editingRules)}
            xstyle={styles.iconOnPhone}
          >
            <span {...stylex.props(styles.labelOnPhone)}>Sorting rules</span>
          </Button>
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
      {failure && (
        <div id="board-failure" tabIndex={-1} {...stylex.props(styles.failureFocus)}>
          <Alert weather="rain">
            <span {...stylex.props(styles.failure)}>
              {failure}
              <Button size="sm" variant="ghost" icon="close" onClick={() => setFailure(null)}>
                Dismiss
              </Button>
            </span>
          </Alert>
        </div>
      )}
      <VisuallyHidden>
        <span role="status">{status}</span>
      </VisuallyHidden>
      {/* While rebalancing, the panel docks beside the people on a wide screen, so each move's
          effect on their weather and forecast shows as it's made. */}
      <div {...stylex.props(styles.boardArea, rebalancing && styles.docked)}>
        {rebalancing && (
          <div id="rebalance-panel" {...stylex.props(styles.dock)}>
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
        <div {...stylex.props(styles.people, rebalancing && styles.peopleDocked)}>
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
      </div>
    </section>
  );
}

/** The team's weather now and why, on a chip of its own so it reads on every sky. */
function TeamForecast({ weather }: { weather: TeamWeather }) {
  const icon = weatherIcon[weather.kind];
  return (
    <Chip weather={icon} label={`Team weather: ${weatherLabels[icon]}.`} xstyle={styles.chip}>
      <strong {...stylex.props(styles.chipLead)}>{weather.reason}</strong>
    </Chip>
  );
}

/**
 * Too much of the team's open work sits in Drop: a backlog filling with things nobody means to
 * do. Shown only past the team's alert, on a chip like the weather's so it reads on every sky.
 */
function BacklogRotFlag({ reason }: { reason: string }) {
  return (
    <Chip weather="fog" xstyle={styles.chip}>
      <strong {...stylex.props(styles.chipLead)}>Backlog rot:</strong> {reason}. Close what nobody
      will do, or give it a priority or a due date.
    </Chip>
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

// Wide enough for the people beside the panel to keep two columns.
const DOCKED = "@media (min-width: 1080px)";
const PHONE = "@media (max-width: 639px)";
const PANEL_WIDTH = "clamp(380px, 32vw, 460px)";

const styles = stylex.create({
  // Clear of the sticky header when focus scrolls it into view.
  failureFocus: { outline: "none", scrollMarginTop: "88px" },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    height: "52px",
    paddingInline: { default: space.md, "@media (min-width: 768px)": space.lg },
    color: colors.ink,
    backgroundColor: "rgba(255, 255, 255, 0.82)",
    backdropFilter: "blur(16px)",
    borderBottom: `1px solid ${colors.border}`,
  },
  brand: { display: "flex", alignItems: "center", gap: space.sm, minWidth: 0 },
  workspace: { display: { default: "none", "@media (min-width: 640px)": "inline-flex" } },
  account: { display: "flex", alignItems: "center", gap: space.xs, margin: 0 },
  viewerName: {
    fontWeight: 500,
    fontSize: "0.8125rem",
    display: { default: "none", "@media (min-width: 640px)": "inline" },
  },
  main: {
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
    maxWidth: "1440px",
    marginInline: "auto",
    paddingBlock: space.lg,
    paddingInline: { default: space.md, "@media (min-width: 768px)": space.lg },
  },
  notice: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.sm,
    padding: { default: space.lg, "@media (min-width: 768px)": space.xl },
  },
  title: {
    fontSize: "1.375rem",
    fontWeight: 600,
    letterSpacing: "-0.015em",
    lineHeight: 1.2,
  },
  lead: { maxWidth: "40rem", fontSize: "0.875rem", lineHeight: 1.55, color: colors.inkMuted },
  // Straight on the sky, so its colour follows the sky's, easing with it.
  onSky: { color: boardSky.text, transitionProperty: "color", transitionDuration: "1.6s" },
  // Muted by fading whatever colour the sky gives text.
  subtitle: { opacity: 0.75, fontSize: "0.8125rem", marginTop: "2px" },
  chip: { marginTop: space.sm, marginInlineEnd: space.xs },
  chipLead: { fontWeight: 500 },
  board: { display: "flex", flexDirection: "column", gap: space.md },
  boardHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space.md,
  },
  boardArea: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: space.sm },
  docked: {
    gridTemplateColumns: { default: "minmax(0, 1fr)", [DOCKED]: `minmax(0, 1fr) ${PANEL_WIDTH}` },
    alignItems: "start",
  },
  // On a wide screen the panel sits to the right and stays in view as the board scrolls, and
  // scrolls on its own when its moves run longer than the window.
  dock: {
    gridColumn: { default: null, [DOCKED]: "2" },
    gridRow: { default: null, [DOCKED]: "1" },
    position: { default: null, [DOCKED]: "sticky" },
    top: { default: null, [DOCKED]: "64px" },
    display: { default: null, [DOCKED]: "flex" },
    flexDirection: "column",
    maxHeight: { default: null, [DOCKED]: "calc(100dvh - 80px)" },
    minWidth: 0,
  },
  peopleDocked: {
    gridColumn: { default: null, [DOCKED]: "1" },
    gridRow: { default: null, [DOCKED]: "1" },
  },
  // Side by side, as many as fit; each card only as tall as its own list.
  people: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
    alignItems: "start",
    gap: space.sm,
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: { default: null, [PHONE]: "100%" },
    minWidth: 0,
  },
  // The picker shrinks first, and on phones takes the row's spare width, pushing the actions
  // to the right edge.
  pickerSlot: {
    display: "flex",
    minWidth: 0,
    flexShrink: 1,
    marginInlineEnd: { default: "6px", [PHONE]: "auto" },
  },
  // A square icon button on phones; its label stays for screen readers and in the title.
  iconOnPhone: {
    flexShrink: 0,
    aspectRatio: { default: null, [PHONE]: "1" },
    paddingInline: { default: null, [PHONE]: 0 },
  },
  labelOnPhone: {
    position: { default: null, [PHONE]: "absolute" },
    width: { default: null, [PHONE]: "1px" },
    height: { default: null, [PHONE]: "1px" },
    overflow: { default: null, [PHONE]: "hidden" },
    clipPath: { default: null, [PHONE]: "inset(50%)" },
    whiteSpace: "nowrap",
  },
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
    gap: space.sm,
  },
  heading: { fontSize: "0.8125rem", fontWeight: 600, marginBottom: space.sm },
  matrix: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" },
  quadrant: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    paddingBlock: space.xs,
    paddingInline: "10px",
    borderRadius: radii.sm,
    backgroundColor: colors.subtle,
    boxShadow: `inset 0 0 0 1px ${colors.border}`,
  },
  quadrantName: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontWeight: 500,
    fontSize: "0.8125rem",
  },
  quadrantRule: { fontSize: "0.75rem", lineHeight: 1.4, color: colors.inkMuted },
  weatherList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
  },
  weatherItem: { display: "flex", alignItems: "center", gap: space.xs, fontSize: "0.8125rem" },
  muted: { color: colors.inkMuted },
});
