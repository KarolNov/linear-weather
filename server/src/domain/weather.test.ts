import { describe, expect, it } from "vitest";
import { buildMatrix, type MatrixIssue } from "./matrix";
import { DEFAULT_RULES } from "./quadrant";
import { loadMetricFor, teamWeather, urgentLoad, weatherFor } from "./weather";

const TODAY = "2026-10-18";

let next = 0;
const matrixOf = (...issues: MatrixIssue[]) =>
  buildMatrix(
    issues.map((issue) => ({ id: `i${next++}`, ...issue })),
    DEFAULT_RULES,
    TODAY,
  );

// Under the default rules: High priority due in 3 days is Do; Low due in 3 days is Delegate.
const doIssue = (estimate: number | null = 1): MatrixIssue => ({
  priority: 2,
  dueDate: "2026-10-21",
  estimate,
});
const delegateIssue = (estimate: number | null = 1): MatrixIssue => ({
  priority: 4,
  dueDate: "2026-10-21",
  estimate,
});
const overdueDo: MatrixIssue = { priority: 1, dueDate: "2026-10-15", estimate: 1 };
const undated: MatrixIssue = { priority: 2, dueDate: null, estimate: 3 };
const later: MatrixIssue = { priority: 2, dueDate: "2026-12-01", estimate: 3 };

describe("weatherFor", () => {
  it.each([
    [0, "sunny"],
    [7, "sunny"],
    [7.5, "cloudy"],
    [10, "cloudy"],
    [12.5, "cloudy"],
    [13, "rain"],
    [15, "rain"],
    [15.1, "storm"],
  ] as const)("calls a load of %d against an average of 10 %s", (load, kind) => {
    expect(weatherFor(load, 10, false)).toBe(kind);
  });

  it("is a storm with overdue Do work, however light the load", () => {
    expect(weatherFor(1, 10, true)).toBe("storm");
    expect(weatherFor(null, 10, true)).toBe("storm");
  });

  it("is fog when the load can't be measured", () => {
    expect(weatherFor(null, 10, false)).toBe("fog");
  });

  it("is sunny for everyone when nobody has anything urgent", () => {
    expect(weatherFor(0, 0, false)).toBe("sunny");
  });

  it("takes other thresholds", () => {
    const strict = { sunnyBelow: 0.5, rainAbove: 1.1, stormAbove: 2 };
    expect(weatherFor(6, 10, false, strict)).toBe("cloudy");
    expect(weatherFor(12, 10, false, strict)).toBe("rain");
    expect(weatherFor(19, 10, false, strict)).toBe("rain");
  });
});

describe("loadMetricFor", () => {
  it("counts points when the team estimates, issues when it doesn't", () => {
    expect(loadMetricFor([{ ...undated, estimate: null }, later])).toBe("points");
    expect(loadMetricFor([{ ...undated, estimate: null }])).toBe("issues");
    expect(loadMetricFor([])).toBe("issues");
  });
});

describe("urgentLoad", () => {
  it("adds up Do and Delegate only, by points or by count", () => {
    const matrix = matrixOf(doIssue(3), delegateIssue(5), later);
    expect(urgentLoad(matrix, "points", TODAY)).toEqual({ load: 8, overdueDo: 0 });
    expect(urgentLoad(matrix, "issues", TODAY)).toEqual({ load: 2, overdueDo: 0 });
  });

  it("counts overdue Do issues", () => {
    expect(urgentLoad(matrixOf(overdueDo, doIssue()), "issues", TODAY).overdueDo).toBe(1);
  });

  it("counts only the estimated issues when some urgent work is unestimated", () => {
    expect(urgentLoad(matrixOf(doIssue(3), doIssue(null)), "points", TODAY).load).toBe(3);
  });

  it("can't measure points when no urgent issue is estimated", () => {
    expect(urgentLoad(matrixOf(doIssue(null)), "points", TODAY)).toEqual({
      load: null,
      overdueDo: 0,
      unknown: "unestimated",
    });
    expect(urgentLoad(matrixOf(doIssue(null)), "issues", TODAY).load).toBe(1);
  });

  it("can't tell whether someone with only undated work is idle", () => {
    expect(urgentLoad(matrixOf(undated), "issues", TODAY)).toMatchObject({
      load: null,
      unknown: "undated",
    });
    // Dated work that isn't urgent yet: nothing on now, and that's known.
    expect(urgentLoad(matrixOf(later), "issues", TODAY).load).toBe(0);
    expect(urgentLoad(matrixOf(), "issues", TODAY).load).toBe(0);
  });
});

describe("teamWeather", () => {
  it("compares each person with the average of everyone who could be measured", () => {
    const { people, team } = teamWeather(
      [
        { name: "Tony", matrix: matrixOf(doIssue(), doIssue(), doIssue(), delegateIssue()) },
        { name: "Steve", matrix: matrixOf(doIssue(), doIssue()) },
        { name: "Wanda", matrix: matrixOf() },
        { name: "Thor", matrix: matrixOf(undated) },
      ],
      "issues",
      TODAY,
    );
    // (4 + 2 + 0) / 3: Thor's load is unknown, so he's left out.
    expect(people.map((p) => [p.kind, p.load, p.teamAverage])).toEqual([
      ["storm", 4, 2],
      ["cloudy", 2, 2],
      ["sunny", 0, 2],
      ["fog", null, 2],
    ]);
    expect(people[0]?.reason).toBe("4 urgent issues, 2.0× the team average");
    expect(people[3]?.reason).toBe("Nothing urgent, only undated work");
    expect(team).toMatchObject({ kind: "storm", load: 4, reason: "Tony is in a storm" });
  });

  it("says when overdue Do work makes the storm", () => {
    const { people, team } = teamWeather(
      [
        { name: "Natasha", matrix: matrixOf(overdueDo) },
        { name: "Bruce", matrix: matrixOf(doIssue()) },
      ],
      "points",
      TODAY,
    );
    expect(people[0]).toMatchObject({
      kind: "storm",
      reason: "1 urgent point, 1.0× the team average; 1 Do issue overdue",
    });
    expect(team.reason).toBe("Natasha is in a storm");
  });

  it("is rainy when the worst is rain, naming everyone under it", () => {
    const { team } = teamWeather(
      [
        { name: "A", matrix: matrixOf(doIssue(14)) },
        { name: "B", matrix: matrixOf(doIssue(14)) },
        { name: "C", matrix: matrixOf(doIssue(10)) },
        { name: "D", matrix: matrixOf(doIssue(10)) },
        { name: "E", matrix: matrixOf(doIssue(7)) },
      ],
      "points",
      TODAY,
    );
    // Average 11: A and B at 1.27×, E at 0.64×.
    expect(team).toMatchObject({ kind: "rain", reason: "A and B are under rain" });
  });

  it("is sunny when the load is spread evenly, cloudy when some have room", () => {
    const even = teamWeather(
      [
        { name: "A", matrix: matrixOf(doIssue(4)) },
        { name: "B", matrix: matrixOf(doIssue(5)) },
        { name: "C", matrix: matrixOf(doIssue(6)) },
      ],
      "points",
      TODAY,
    );
    expect(even.team).toMatchObject({ kind: "sunny", reason: "Urgent load is spread evenly" });

    const uneven = teamWeather(
      [
        { name: "A", matrix: matrixOf(doIssue(), doIssue()) },
        { name: "B", matrix: matrixOf(doIssue(), doIssue()) },
        { name: "C", matrix: matrixOf(doIssue()) },
      ],
      "issues",
      TODAY,
    );
    expect(uneven.team).toMatchObject({
      kind: "cloudy",
      reason: "C has room while others carry the load",
    });
  });

  it("is sunny with nothing urgent anywhere, and fog when nobody can be measured", () => {
    expect(
      teamWeather([{ name: "A", matrix: matrixOf(later) }], "issues", TODAY).team,
    ).toMatchObject({ kind: "sunny", teamAverage: 0 });
    const foggy = teamWeather([{ name: "A", matrix: matrixOf(undated) }], "issues", TODAY);
    expect(foggy.team).toMatchObject({ kind: "fog", load: null, teamAverage: null });
    expect(teamWeather([], "issues", TODAY).team.kind).toBe("fog");
  });
});
