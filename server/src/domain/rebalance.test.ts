import { describe, expect, it } from "vitest";
import { buildMatrix, type MatrixIssue, type Overrides } from "./matrix";
import { DEFAULT_RULES } from "./quadrant";
import { rebalance, type Suggestion } from "./rebalance";

// Weeks run Oct 18–24, Oct 25–31, Nov 1–7, Nov 8–14. Under the default rules an issue turns
// urgent 13 days before it's due.
const TODAY = "2026-10-18";
const SOON = "2026-10-25";

let next = 0;
const issue = (
  dueDate: string | null,
  priority: MatrixIssue["priority"] = 2,
  estimate: number | null = 1,
) => ({ id: `i${next++}`, priority, dueDate, estimate });
const person = (
  name: string,
  issues: ReturnType<typeof issue>[],
  overrides: Overrides = new Map(),
) => ({ name, matrix: buildMatrix(issues, DEFAULT_RULES, TODAY, overrides) });
const times = (n: number, make: () => ReturnType<typeof issue>) => Array.from({ length: n }, make);

const moves = (suggestions: Suggestion<{ name: string }, { id: string }>[]) =>
  suggestions.map(({ issue, from, to, week }) => [issue.id, from.name, to.name, week]);

describe("rebalance now", () => {
  it("moves urgent work from the busiest to the least busy until nobody is overloaded", () => {
    const ana = times(6, () => issue(SOON));
    const suggestions = rebalance(
      [person("Ana", ana), person("Ben", [issue(SOON)]), person("Cy", [issue(SOON), issue(SOON)])],
      "now",
      "issues",
      TODAY,
    );
    // 6, 1, 2 (average 3): Ana hands Ben two, then Cy one, leaving 3, 3, 3.
    expect(suggestions.map(({ from, to }) => [from.name, to.name])).toEqual([
      ["Ana", "Ben"],
      ["Ana", "Ben"],
      ["Ana", "Cy"],
    ]);
    expect(suggestions.at(-1)?.fromWeather).toBe("cloudy");
    expect(suggestions.at(-1)?.toWeather).toBe("cloudy");
    expect(suggestions[0]?.reason).toBe(
      "Ana goes from 2.0× to 1.67× the team average, Ben from 0.33× to 0.67×",
    );
    expect(suggestions.every(({ week }) => week === null)).toBe(true);
  });

  it("suggests nothing when nobody is overloaded", () => {
    const team = [person("Ana", [issue(SOON), issue(SOON)]), person("Ben", [issue(SOON)])];
    expect(rebalance(team, "now", "issues", TODAY)).toEqual([]);
  });

  it("picks the issue that leaves the two closest, in points", () => {
    const big = issue(SOON, 2, 5);
    const team = [
      person("Ana", [issue(SOON, 2, 1), big, issue(SOON, 2, 8)]),
      person("Ben", [issue(SOON, 2, 2)]),
      person("Cy", [issue(SOON, 2, 4)]),
    ];
    // Ana 14, Ben 2: a gap of 12, which 5 points halves best (9 and 7).
    const [first] = rebalance(team, "now", "points", TODAY);
    expect(first?.issue.id).toBe(big.id);
    expect(first?.to.name).toBe("Ben");
  });

  it("would rather hand over unimportant, low-priority work", () => {
    const low = issue(SOON, 4);
    const team = [
      person("Ana", [issue(SOON, 1), issue(SOON, 2), low, issue(SOON, 3)]),
      person("Ben", []),
      person("Cy", [issue(SOON)]),
    ];
    expect(rebalance(team, "now", "issues", TODAY)[0]?.issue.id).toBe(low.id);
  });

  it("leaves overdue work where it is, and gives nothing to anyone running late", () => {
    const late = issue("2026-10-10");
    const team = [
      person("Ana", [late, ...times(4, () => issue(SOON))]),
      person("Ben", [issue("2026-10-12")]),
      person("Cy", [issue(SOON)]),
    ];
    const suggestions = rebalance(team, "now", "issues", TODAY);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every(({ issue }) => issue.id !== late.id)).toBe(true);
    expect(suggestions.every(({ to }) => to.name === "Cy")).toBe(true);
    // Ana still has her overdue issue, so she stays in a storm.
    expect(suggestions.every(({ fromWeather }) => fromWeather === "storm")).toBe(true);
  });

  it("stops when no single move narrows the gap", () => {
    // Ana's 8 points are one issue: handing it to Ben (1) only swaps who is overloaded.
    const team = [
      person("Ana", [issue(SOON, 2, 8)]),
      person("Ben", [issue(SOON, 2, 1)]),
      person("Cy", [issue(SOON, 2, 1)]),
    ];
    expect(rebalance(team, "now", "points", TODAY)).toEqual([]);
  });

  it("counts load as the weather would when no metric is given", () => {
    const team = [
      person("Ana", [issue(SOON, 2, 8), issue(SOON, 2, 1)]),
      person("Ben", [issue(SOON, 2, 1), issue(SOON, 2, 1)]),
      person("Cy", [issue(SOON, 2, 1), issue(SOON, 2, 1)]),
    ];
    // In issues everyone holds two, so nobody is overloaded; in points, Ana is.
    expect(rebalance(team, "now", "issues", TODAY)).toEqual([]);
    expect(rebalance(team, "now", null, TODAY)).toHaveLength(1);
  });
});

describe("rebalance forecast", () => {
  it("moves work before it turns urgent, in the week the storm would arrive", () => {
    // Due Nov 18: urgent from Nov 5, in the third week.
    const coming = times(4, () => issue("2026-11-18"));
    const team = [
      person("Ana", coming),
      person("Ben", [issue("2026-11-30")]),
      person("Cy", [issue("2026-11-18")]),
    ];
    expect(rebalance(team, "now", "issues", TODAY)).toEqual([]);
    const suggestions = rebalance(team, "forecast", "issues", TODAY);
    // Week 3: Ana 4, Ben 0, Cy 1.
    expect(moves(suggestions)).toEqual([
      [expect.any(String), "Ana", "Ben", 3],
      [expect.any(String), "Ana", "Ben", 3],
    ]);
    expect(suggestions.every(({ issue }) => coming.some(({ id }) => id === issue.id))).toBe(true);
    expect(suggestions.at(-1)?.toWeather).not.toBe("rain");
  });

  it("weighs every week an issue counts in, so easing one week doesn't swamp another", () => {
    // Everyone has three issues due Oct 31, urgent already, so today is even. Ana's and Dee's
    // other work turns urgent Oct 31 and is due Nov 13, so it weighs on weeks 2 and 3.
    const busy = () => times(3, () => issue("2026-10-31"));
    const team = [
      person("Ana", [...busy(), ...times(4, () => issue("2026-11-13"))]),
      person("Ben", busy()),
      person("Cy", busy()),
      person("Dee", [...busy(), ...times(2, () => issue("2026-11-13"))]),
    ];
    expect(rebalance(team, "now", "issues", TODAY)).toEqual([]);
    const suggestions = rebalance(team, "forecast", "issues", TODAY);
    const ids = suggestions.map(({ issue }) => issue.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Week 2: Ana 7, Ben 3, Cy 3, Dee 5; week 3: 4, 0, 0, 2. One each to Ben and Cy leaves
    // 5, 4, 4, 5 and 2, 1, 1, 2: a third would put Ben or Cy above Ana in week 2.
    expect(moves(suggestions).map(([, ...move]) => move)).toEqual([
      ["Ana", "Ben", 2],
      ["Ana", "Cy", 2],
    ]);
  });

  it("starts from the board as today's moves leave it", () => {
    // Today Ana holds all the urgent work, due Oct 31. Ben's turns urgent on Oct 23, in week 1.
    const team = [
      person(
        "Ana",
        times(4, () => issue("2026-10-31")),
      ),
      person(
        "Ben",
        times(3, () => issue("2026-11-05")),
      ),
      person("Cy", []),
      person("Dee", []),
    ];
    // Today: one each to Ben, Cy and Dee.
    expect(moves(rebalance(team, "now", "issues", TODAY)).map(([, ...move]) => move)).toEqual([
      ["Ana", "Ben", null],
      ["Ana", "Cy", null],
      ["Ana", "Dee", null],
    ]);
    // Week 1 after those: Ana 1, Ben 4, Cy 1, Dee 1, so Ben hands on two, ties going to whoever
    // comes first. Without them Ana would look busiest, with nothing that isn't urgent already,
    // and nothing would move.
    expect(moves(rebalance(team, "forecast", "issues", TODAY)).map(([, ...move]) => move)).toEqual([
      ["Ben", "Ana", 1],
      ["Ben", "Cy", 1],
    ]);
  });

  it("doesn't touch work already urgent, which is for now", () => {
    const team = [
      person(
        "Ana",
        times(4, () => issue(SOON)),
      ),
      person("Ben", []),
      person("Cy", [issue(SOON)]),
    ];
    expect(rebalance(team, "forecast", "issues", TODAY)).toEqual([]);
  });

  it("looks no further than the horizon", () => {
    // Due Dec 10: urgent from Nov 27, in the sixth week.
    const team = [
      person(
        "Ana",
        times(4, () => issue("2026-12-10")),
      ),
      person("Ben", []),
      person("Cy", [issue("2026-12-10")]),
    ];
    expect(rebalance(team, "forecast", "issues", TODAY, { weeks: 4 })).toEqual([]);
    expect(rebalance(team, "forecast", "issues", TODAY, { weeks: 6 })[0]?.week).toBe(6);
  });

  it("leaves issues placed by hand where they were put", () => {
    const pinned = times(4, () => issue("2026-11-18"));
    const team = [
      person("Ana", pinned, new Map(pinned.map(({ id }) => [id, "schedule"]))),
      person("Ben", []),
      person("Cy", [issue("2026-11-18")]),
    ];
    expect(rebalance(team, "forecast", "issues", TODAY)).toEqual([]);
  });
});
