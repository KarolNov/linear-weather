import { render } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { BoardShell } from "./BoardShell";
import type { Board, BoardIssue, Matrix, Suggestion, TeamBoardData, WeatherKind } from "./board";
import { teamBoard } from "./board";
import { documentText } from "./document-text";

// The rain's drawing code, stubbed so a test sees the sky start, change and stop it.
const rain = vi.hoisted(() => {
  const drops = { setIntensity: vi.fn(), stop: vi.fn() };
  return { drops, startRain: vi.fn(() => drops) };
});
vi.mock("../../ui/src/rain", () => ({ startRain: rain.startRain }));

const avengers = { id: "t-avg", name: "Avengers", key: "AVG" };
const ops = { id: "t-ops", name: "S.H.I.E.L.D. Ops", key: "OPS" };
const tony = { id: "u-tony", name: "Tony Stark", avatarUrl: null };
const bruce = { id: "u-bruce", name: "Bruce Banner", avatarUrl: null };
const viewer = { name: "Nick Fury", avatarUrl: null, organization: { name: "S.H.I.E.L.D." } };

const reactor: BoardIssue = {
  id: "i-1",
  identifier: "AVG-1",
  title: "Patch the arc reactor",
  url: "https://linear.app/shield/issue/AVG-1",
  dueDate: "2026-10-13",
  priority: 1,
  estimate: 5,
  state: { name: "In Progress" },
  quadrantSource: "RULE",
  placementReason: "Urgent priority, overdue by 5 days",
};

const empty: Matrix = {
  counts: { do: 0, schedule: 0, delegate: 0, drop: 0 },
  do: [],
  schedule: [],
  delegate: [],
  drop: [],
};

/** The Avengers' board with Tony's one issue in `quadrant`, and the team in `weather`. */
function avengersBoard(
  weather: { kind: WeatherKind; reason: string },
  quadrant: "do" | "schedule" = "do",
): TeamBoardData {
  const issue: BoardIssue =
    quadrant === "do"
      ? reactor
      : { ...reactor, quadrantSource: "OVERRIDE", placementReason: "Placed by hand" };
  return {
    ...avengers,
    rules: {
      importantFrom: 3,
      urgencyWindowDays: 14,
      noDueDate: "NOT_URGENT",
      dropAlertPercent: 40,
      awayStatuses: [],
      blockersAreImportant: false,
      currentCycleIsUrgent: false,
    },
    weather,
    backlogRot: { rotting: false, reason: "0 of 1 open issues (0%) are in Drop" },
    rebalanceNow: [],
    rebalanceForecast: [],
    people: [
      {
        ...tony,
        capacity: 1,
        timeOff: [],
        matrix: { ...empty, counts: { ...empty.counts, [quadrant]: 1 }, [quadrant]: [issue] },
        weather: { ...weather, overdue: 0 },
        forecast: [],
      },
    ],
    unassigned: empty,
  };
}

const storm = { kind: "STORM", reason: "Tony Stark is in a storm" } as const;
const sunny = { kind: "SUNNY", reason: "Everyone's load is light" } as const;

/** The board as the page loaded it. */
function loaded(team: TeamBoardData): Board {
  return { today: "2026-10-18", teams: [avengers, ops], ...teamBoard(team) };
}

/** Answers every move with `team`'s board, as the server does. */
function serverAnswering(team: TeamBoardData) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
    Response.json({ data: { overrideQuadrant: { __typename: "OverrideSuccess", team } } }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** A request the server hasn't answered yet. */
interface HeldRequest {
  query: string;
  variables: Record<string, unknown>;
  answer: (data: unknown) => void;
}

/** A server that holds each request until the test answers it, so a test can act mid-request. */
function serverHolding() {
  const held: HeldRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          const { documentId, variables } = JSON.parse(String(init.body));
          // The board sends each operation's id; look its text up, as the server does.
          const query = documentText(documentId);
          held.push({ query, variables, answer: (data) => resolve(Response.json({ data })) });
        }),
    ),
  );
  return {
    /** The next request to arrive, once it has. */
    async next() {
      await vi.waitFor(() => expect(held.length).toBeGreaterThan(0));
      return held.shift() as HeldRequest;
    },
  };
}

/** The server's answer to a hand-over: the team's board after it. */
const handedOver = (team: TeamBoardData) => ({
  reassignIssue: { __typename: "ReassignSuccess", team },
});

/** Tony handing AVG-`n` to Bruce: today with no `week`, else ahead of a storm that week. */
function handOver(n: number, week: number | null = null): Suggestion {
  return {
    issue: {
      id: `i-${n}`,
      identifier: `AVG-${n}`,
      title: `Job ${n}`,
      url: `https://linear.app/shield/issue/AVG-${n}`,
      quadrant: week === null ? "DO" : "SCHEDULE",
      becomesUrgentOn: week === null ? "2026-10-18" : "2026-10-25",
    },
    from: tony,
    to: bruce,
    week,
    fromWeather: "CLOUDY",
    toWeather: "SUNNY",
    reason: "Tony Stark goes from 2× to 1× the team average",
    fromLoad: { before: 2, after: 1 },
    toLoad: { before: 0, after: 1 },
  };
}

/** The Avengers' board in a storm, with these moves to make today and ahead of time. */
function rebalancing(now: Suggestion[], forecast: Suggestion[] = []): TeamBoardData {
  return { ...avengersBoard(storm), rebalanceNow: now, rebalanceForecast: forecast };
}

/** The board's live updates, as the server would send them: `emit` sends an event. */
class FakeEventSource {
  static opened: FakeEventSource[] = [];
  readyState = 0;
  private readonly listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();
  constructor(readonly url: string) {
    FakeEventSource.opened.push(this);
  }
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.readyState = 2;
  }
  emit(type: string, data = "") {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data } as MessageEvent<string>);
    }
  }
}

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
  FakeEventSource.opened = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(async () => {
  render(null, root);
  root.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "" }],
  });
});

const sky = () => root.querySelector<HTMLElement>("[data-weather]");
/** The chip under the team's name with its weather and why. */
const teamForecast = () =>
  root.querySelector('[aria-label^="Team weather"]')?.closest("p")?.textContent;

/** Opens Tony's list and moves AVG-1 to Schedule through its menu. */
async function moveReactorToSchedule() {
  await userEvent.click(page.getByRole("button", { name: "Expand all" }));
  await userEvent.click(page.getByRole("button", { name: "Move AVG-1" }));
  await userEvent.click(
    page.getByRole("group", { name: "Move AVG-1 to" }).getByRole("button", { name: "Schedule" }),
  );
}

describe("the board after a move", () => {
  it("turns the sky and the team's forecast to the weather the answer brings", async () => {
    const fetch = serverAnswering(avengersBoard(sunny, "schedule"));
    render(<BoardShell viewer={viewer} board={loaded(avengersBoard(storm))} />, root);
    expect(sky()?.dataset.weather).toBe("storm");
    expect(teamForecast()).toContain(storm.reason);

    await moveReactorToSchedule();

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await expect.poll(() => sky()?.dataset.weather).toBe("sun");
    await expect.poll(teamForecast).toContain(sunny.reason);
  });

  it("gives the keyboard back to the moved card's button in its new quadrant", async () => {
    serverAnswering(avengersBoard(sunny, "schedule"));
    render(<BoardShell viewer={viewer} board={loaded(avengersBoard(storm))} />, root);

    await moveReactorToSchedule();

    // The card is drawn again in Schedule, as hand-placed, and its button there has the keyboard.
    // Case-sensitive and anchored, so the badge matches and not its "Placed by hand" reason.
    const schedule = page.getByRole("region", { name: "Tony Stark: Schedule" });
    await expect.element(schedule.getByText(/^By hand/)).toBeVisible();
    await expect.element(schedule.getByRole("button", { name: "Move AVG-1" })).toHaveFocus();
  });
});

describe("live updates", () => {
  it("redraws the board from a change made elsewhere, on the day it was read", async () => {
    render(<BoardShell viewer={viewer} board={loaded(avengersBoard(storm))} />, root);
    await vi.waitFor(() => expect(FakeEventSource.opened).toHaveLength(1));
    const [source] = FakeEventSource.opened;
    expect(source?.url).toContain("documentId=sha256");
    source?.emit("open");

    source?.emit(
      "next",
      JSON.stringify({
        data: {
          teamWeatherUpdated: { today: "2026-10-20", team: avengersBoard(sunny, "schedule") },
        },
      }),
    );

    await expect.poll(() => sky()?.dataset.weather).toBe("sun");
    await expect.poll(teamForecast).toContain(sunny.reason);
  });

  it("doesn't listen in the demo, whose changes live in this browser", async () => {
    render(<BoardShell viewer={viewer} board={loaded(avengersBoard(storm))} demo />, root);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(FakeEventSource.opened).toHaveLength(0);
  });
});

describe("the board's sorting rules", () => {
  it("sends the away statuses typed in the rules panel, and shows the board that comes back", async () => {
    const away = {
      kind: "STORM",
      reason: "Tony Stark is away with 1 urgent issue",
    } as const;
    const answer = avengersBoard(away);
    answer.rules = { ...answer.rules, awayStatuses: ["🌴"] };
    const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({
        data: { updateQuadrantRules: { __typename: "UpdateRulesSuccess", team: answer } },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<BoardShell viewer={viewer} board={loaded(avengersBoard(storm))} />, root);

    await userEvent.click(page.getByRole("button", { name: "Sorting rules" }));
    // Filled, not typed: typing sends an emoji's two UTF-16 halves as separate keys.
    await userEvent.fill(
      page.getByRole("textbox", { name: /^Away when their Linear status is/ }),
      "🌴",
    );
    await userEvent.click(page.getByRole("button", { name: "Save rules" }));

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const { variables } = JSON.parse(String(fetch.mock.calls[0]?.[1].body));
    expect(variables).toEqual({
      teamId: avengers.id,
      input: { ...answer.rules },
    });
    await expect.poll(teamForecast).toContain(away.reason);
    // The panel closes on success; opened again, it starts from what was saved.
    await userEvent.click(page.getByRole("button", { name: "Sorting rules" }));
    await expect
      .element(page.getByRole("textbox", { name: /^Away when their Linear status is/ }))
      .toHaveValue("🌴");
  });
});

describe("the rain on the board's sky", () => {
  it("falls in a storm, and eases to rain when a move's answer brings it", async () => {
    serverAnswering(avengersBoard({ kind: "RAIN", reason: "Tony Stark is busy" }, "schedule"));
    render(<BoardShell viewer={viewer} board={loaded(avengersBoard(storm))} />, root);
    await vi.waitFor(() =>
      expect(rain.startRain).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), "storm"),
    );

    await moveReactorToSchedule();

    await vi.waitFor(() => expect(rain.drops.setIntensity).toHaveBeenCalledWith("rain"));
    expect(rain.startRain).toHaveBeenCalledOnce();
  });

  it("stops when reduced motion is turned on mid-session", async () => {
    render(<BoardShell viewer={viewer} board={loaded(avengersBoard(storm))} />, root);
    await vi.waitFor(() => expect(rain.startRain).toHaveBeenCalledOnce());

    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });

    // It eases off with the sky's turn, then stops.
    await vi.waitFor(() => expect(rain.drops.stop).toHaveBeenCalledOnce(), { timeout: 3000 });
  });

  it("never starts with reduced motion on", async () => {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    render(<BoardShell viewer={viewer} board={loaded(avengersBoard(storm))} />, root);
    expect(sky()?.dataset.weather).toBe("storm");

    // Once the sky's effects have run, load the drawing code ourselves: had the sky asked for it
    // first, its load lands before ours, and it would have started by the next task.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
    await import("../../ui/src/rain");
    await new Promise((resolve) => setTimeout(resolve));
    expect(rain.startRain).not.toHaveBeenCalled();
  });
});

describe("the rebalance panel", () => {
  /** Renders `team`'s board and opens its rebalance panel. */
  async function openPanel(team: TeamBoardData) {
    render(<BoardShell viewer={viewer} board={loaded(team)} />, root);
    await userEvent.click(page.getByRole("button", { name: /^Rebalance/ }));
  }
  const makeAll = () => page.getByRole("button", { name: "Make all of today's moves" });
  const making = () => page.getByRole("button", { name: "Making today's moves…" });
  const question = () => page.getByText(/^Make these \d+ moves in Linear\?$/);

  it("stays locked through today's moves when a single hand-over answers mid-run", async () => {
    const server = serverHolding();
    await openPanel(rebalancing([handOver(2), handOver(3)], [handOver(4, 2)]));

    // A move ahead of time first, then today's, which wait behind it.
    await userEvent.click(page.getByRole("button", { name: "Hand AVG-4 to Bruce Banner" }));
    const ahead = await server.next();
    await userEvent.click(makeAll());
    await userEvent.click(page.getByRole("button", { name: "Make them" }));
    await expect.element(making()).toBeDisabled();

    // The single move answers while today's run is still going.
    ahead.answer(handedOver(rebalancing([handOver(2), handOver(3)])));
    const first = await server.next();
    expect(first.variables).toEqual({ issueId: "i-2", userId: "u-bruce" });
    await expect
      .element(page.getByRole("button", { name: "Hand AVG-4 to Bruce Banner" }))
      .not.toBeInTheDocument();
    await expect.element(making()).toBeDisabled();

    first.answer(handedOver(rebalancing([handOver(3)])));
    (await server.next()).answer(handedOver(rebalancing([])));
    await expect.element(making()).not.toBeInTheDocument();
    await expect.element(page.getByText(/^Nothing to move: nobody/)).toBeInTheDocument();
  });

  it("asks before making today's moves, and gives the keyboard back on Cancel", async () => {
    serverHolding();
    await openPanel(rebalancing([handOver(2), handOver(3)]));

    await userEvent.click(makeAll());
    await expect.element(question()).toHaveFocus();

    await userEvent.click(page.getByRole("button", { name: "Cancel" }));
    await expect.element(question()).not.toBeInTheDocument();
    await expect.element(makeAll()).toHaveFocus();
  });

  it("gives the keyboard to the panel once a hand-over's button is gone", async () => {
    const server = serverHolding();
    await openPanel(rebalancing([handOver(2), handOver(3)]));

    await userEvent.click(page.getByRole("button", { name: "Hand AVG-2 to Bruce Banner" }));
    (await server.next()).answer(handedOver(rebalancing([handOver(3)])));

    await expect.element(page.getByRole("heading", { name: "Rebalancing Avengers" })).toHaveFocus();
  });

  it("takes the keyboard to the failure when one of today's moves fails", async () => {
    const server = serverHolding();
    const before = rebalancing([handOver(2), handOver(3)]);
    await openPanel(before);

    await userEvent.click(makeAll());
    await userEvent.click(page.getByRole("button", { name: "Make them" }));
    (await server.next()).answer({
      reassignIssue: { __typename: "LinearError", message: "Linear said no." },
    });
    // The board is read again, to plan from wherever things stand.
    const reread = await server.next();
    expect(reread.query).toContain("query Team");
    reread.answer({ team: before });

    // Beside its Dismiss button, so matched as part of the alert's text.
    const failure = page.getByText(
      /Couldn't hand AVG-2 to Bruce Banner, so the rest weren't made\. Linear said no\./,
    );
    await expect.element(failure).toBeInTheDocument();
    await expect.poll(() => document.activeElement?.id).toBe("board-failure");
  });

  it("closes the question when a move made underneath it changes today's plan", async () => {
    const server = serverHolding();
    await openPanel(rebalancing([handOver(2), handOver(3)]));

    await userEvent.click(makeAll());
    await expect.element(question()).toBeInTheDocument();
    await userEvent.click(page.getByRole("button", { name: "Hand AVG-2 to Bruce Banner" }));
    (await server.next()).answer(handedOver(rebalancing([handOver(3)])));

    await expect.element(question()).not.toBeInTheDocument();
    await expect.element(makeAll()).toBeEnabled();
  });
});
