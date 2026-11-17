import { render } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { BoardShell } from "./BoardShell";
import type { Board, BoardIssue, Matrix, TeamBoardData, WeatherKind } from "./board";
import { teamBoard } from "./board";

// The rain's drawing code, stubbed so a test sees the sky start, change and stop it.
const rain = vi.hoisted(() => {
  const drops = { setIntensity: vi.fn(), stop: vi.fn() };
  return { drops, startRain: vi.fn(() => drops) };
});
vi.mock("../../ui/src/rain", () => ({ startRain: rain.startRain }));

const avengers = { id: "t-avg", name: "Avengers", key: "AVG" };
const ops = { id: "t-ops", name: "S.H.I.E.L.D. Ops", key: "OPS" };
const tony = { id: "u-tony", name: "Tony Stark", avatarUrl: null };
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

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
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
  root.querySelector('[aria-label^="Team weather"]')?.parentElement?.textContent;

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

    expect(fetch).toHaveBeenCalledOnce();
    await expect.poll(() => sky()?.dataset.weather).toBe("sun");
    await expect.poll(teamForecast).toContain(sunny.reason);
  });

  it("gives the keyboard back to the moved card's button in its new quadrant", async () => {
    serverAnswering(avengersBoard(sunny, "schedule"));
    render(<BoardShell viewer={viewer} board={loaded(avengersBoard(storm))} />, root);

    await moveReactorToSchedule();

    // The card is drawn again in Schedule, as hand-placed, and its button has the keyboard.
    await expect.element(page.getByText("By hand", { exact: false })).toBeInTheDocument();
    await expect
      .poll(() => (document.activeElement as HTMLElement | null)?.dataset.moveTrigger)
      .toBe("i-1");
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

    // Long enough for the drawing code to have loaded, had it been asked for.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(rain.startRain).not.toHaveBeenCalled();
  });
});
