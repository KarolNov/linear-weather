import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamBoardData } from "./board";
import { DOCUMENT_IDS } from "./document-ids";
import { type EventSourceLike, FIRST_RETRY_MS, listenForUpdates, type TeamUpdate } from "./live";

/** An EventSource the test drives: `emit` is the server sending an event. */
class FakeSource implements EventSourceLike {
  readyState = 0;
  closed = false;
  private readonly listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  emit(type: string, data = "") {
    if (type === "open") this.readyState = 1;
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data } as MessageEvent<string>);
    }
  }
  next(body: unknown) {
    this.emit("next", JSON.stringify(body));
  }
}

const team = (id: string) => ({ id, name: "Avengers" }) as TeamBoardData;

function listen(teamId = "team-1") {
  const sources: FakeSource[] = [];
  const updates: TeamUpdate[] = [];
  const stop = listenForUpdates(teamId, { update: (u) => updates.push(u) }, (url) => {
    const source = new FakeSource(url);
    sources.push(source);
    return source;
  });
  return { sources, latest: () => sources.at(-1) as FakeSource, updates, stop };
}

describe("listenForUpdates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks for the team's subscription by its trusted id", () => {
    const { latest } = listen("team-1");
    const url = new URL(latest().url, "https://example.test");
    expect(url.pathname).toBe("/graphql");
    expect(url.searchParams.get("documentId")).toBe(DOCUMENT_IDS.TeamWeather);
    expect(JSON.parse(url.searchParams.get("variables") ?? "")).toEqual({ teamId: "team-1" });
  });

  it("hands on each update to the team", () => {
    const { latest, updates } = listen("team-1");
    latest().emit("open");
    latest().next({ data: { teamWeatherUpdated: { today: "2026-10-19", team: team("team-1") } } });
    // A read that failed this time, as when Linear's rate limit is spent.
    latest().next({
      data: { teamWeatherUpdated: { today: "2026-10-19", team: null } },
      errors: [{ message: "rate limited", extensions: { code: "RATE_LIMITED" } }],
    });
    expect(updates).toEqual([{ today: "2026-10-19", team: team("team-1") }]);
  });

  it("connects again, later each time, when the server ends the stream", () => {
    const { sources, latest } = listen();
    latest().emit("open");
    latest().emit("complete");
    expect(sources[0]?.closed).toBe(true);
    vi.advanceTimersByTime(FIRST_RETRY_MS);
    expect(sources).toHaveLength(2);
    // That one fails outright: the next try waits twice as long.
    latest().emit("error");
    latest().close();
    latest().emit("error");
    vi.advanceTimersByTime(FIRST_RETRY_MS);
    expect(sources).toHaveLength(2);
    vi.advanceTimersByTime(FIRST_RETRY_MS);
    expect(sources).toHaveLength(3);
  });

  it.each([
    [
      "signed out",
      { data: null, errors: [{ message: "", extensions: { code: "UNAUTHENTICATED" } }] },
    ],
    ["refused", { errors: [{ message: "", extensions: { code: "TEAM_NOT_FOUND" } }] }],
  ])("gives up when %s", (_, refusal) => {
    const { sources, latest } = listen();
    latest().emit("open");
    latest().next(refusal);
    latest().emit("complete");
    vi.advanceTimersByTime(10 * FIRST_RETRY_MS);
    expect(sources).toHaveLength(1);
    expect(latest().closed).toBe(true);
  });

  it("stops when asked, and doesn't connect again", () => {
    const { sources, latest, stop } = listen();
    latest().emit("open");
    latest().emit("complete");
    stop();
    vi.advanceTimersByTime(10 * FIRST_RETRY_MS);
    expect(sources).toHaveLength(1);
  });
});
