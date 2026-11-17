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
const overdueDelegate: MatrixIssue = { priority: 4, dueDate: "2026-10-15", estimate: 1 };
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

  it("is a storm with overdue urgent work, however light the load", () => {
    expect(weatherFor(1, 10, true)).toBe("storm");
    expect(weatherFor(null, 10, true)).toBe("storm");
  });

  it("is fog when the load can't be measured", () => {
    expect(weatherFor(null, 10, false)).toBe("fog");
  });

  it("is sunny for everyone when nobody has anything urgent", () => {
    expect(weatherFor(0, 0, false)).toBe("sunny");
    expect(weatherFor(0, null, false)).toBe("sunny");
  });

  it("is fog with nobody to compare with", () => {
    expect(weatherFor(40, null, false)).toBe("fog");
  });

  it("reads the ratio to hundredths, as the reason shows it", () => {
    // 1.504 shows as 1.5×, which isn't over 1.5.
    expect(weatherFor(15.04, 10, false)).toBe("rain");
    expect(weatherFor(12.54, 10, false)).toBe("cloudy");
  });

  it("takes other thresholds", () => {
    const strict = { sunnyBelow: 0.5, rainAbove: 1.1, stormAbove: 2 };
    expect(weatherFor(6, 10, false, strict)).toBe("cloudy");
    expect(weatherFor(12, 10, false, strict)).toBe("rain");
    expect(weatherFor(19, 10, false, strict)).toBe("rain");
  });
});

describe("loadMetricFor", () => {
  it("counts points only when every urgent issue is estimated", () => {
    expect(loadMetricFor([matrixOf(doIssue(3)), matrixOf(delegateIssue(1), later)])).toBe("points");
    expect(loadMetricFor([matrixOf(doIssue(3)), matrixOf(doIssue(null))])).toBe("issues");
    expect(loadMetricFor([])).toBe("issues");
  });

  it("ignores estimates on work that isn't urgent", () => {
    expect(loadMetricFor([matrixOf(doIssue(null), later)])).toBe("issues");
  });
});

describe("urgentLoad", () => {
  it("adds up Do and Delegate only, by points or by count", () => {
    const matrix = matrixOf(doIssue(3), delegateIssue(5), later);
    expect(urgentLoad(matrix, "points", TODAY)).toEqual({ load: 8, urgent: 2, overdue: 0 });
    expect(urgentLoad(matrix, "issues", TODAY)).toEqual({ load: 2, urgent: 2, overdue: 0 });
  });

  it("counts overdue urgent issues, Do and Delegate alike", () => {
    expect(urgentLoad(matrixOf(overdueDo, doIssue()), "issues", TODAY).overdue).toBe(1);
    expect(urgentLoad(matrixOf(overdueDelegate, delegateIssue()), "issues", TODAY).overdue).toBe(1);
  });

  it("still counts an overdue issue moved by hand from Do to Delegate", () => {
    const moved = buildMatrix(
      [{ id: "late", ...overdueDo }],
      DEFAULT_RULES,
      TODAY,
      new Map([["late", "delegate"]]),
    );
    expect(moved.delegate).toHaveLength(1);
    expect(urgentLoad(moved, "issues", TODAY).overdue).toBe(1);
  });

  it("can't measure points when any urgent issue is unestimated, rather than undercount", () => {
    expect(urgentLoad(matrixOf(doIssue(3), doIssue(null)), "points", TODAY)).toEqual({
      load: null,
      urgent: 2,
      overdue: 0,
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

  it("measures urgent work estimated at 0 points, undated work or not", () => {
    expect(urgentLoad(matrixOf(doIssue(0), undated), "points", TODAY)).toEqual({
      load: 0,
      urgent: 1,
      overdue: 0,
    });
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
    expect(people[3]?.reason).toBe("Nothing urgent, but some work has no due date");
    expect(team).toMatchObject({ kind: "storm", load: 4, reason: "Tony is in a storm" });
  });

  it("says when overdue work makes the storm", () => {
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
      reason: "1 urgent point, 1.0× the team average; 1 issue overdue",
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

  it("says when urgent work is estimated at 0 points", () => {
    const { people } = teamWeather(
      [
        { name: "A", matrix: matrixOf(doIssue(0), doIssue(0)) },
        { name: "B", matrix: matrixOf(doIssue(2)) },
      ],
      "points",
      TODAY,
    );
    expect(people[0]).toMatchObject({
      kind: "sunny",
      reason: "2 urgent issues, estimated at 0 points",
    });
  });

  it("is fog when only one person can be measured: nobody to compare with", () => {
    const { people, team } = teamWeather(
      [
        { name: "Tony", matrix: matrixOf(doIssue(40)) },
        { name: "Thor", matrix: matrixOf(undated) },
      ],
      "points",
      TODAY,
    );
    expect(people[0]).toMatchObject({
      kind: "fog",
      teamAverage: null,
      reason: "40 urgent points, nobody else to compare with",
    });
    expect(team).toMatchObject({
      kind: "fog",
      reason: "Only one person's urgent load can be measured",
    });
  });

  it("is sunny with nothing urgent anywhere, and fog when nobody can be measured", () => {
    expect(
      teamWeather([{ name: "A", matrix: matrixOf(later) }], "issues", TODAY).team,
    ).toMatchObject({ kind: "sunny", reason: "Nothing urgent on anyone's plate" });
    const foggy = teamWeather([{ name: "A", matrix: matrixOf(undated) }], "issues", TODAY);
    expect(foggy.team).toMatchObject({ kind: "fog", load: null, teamAverage: null });
    expect(teamWeather([], "issues", TODAY).team.kind).toBe("fog");
  });

  describe("with capacity", () => {
    const six = () => matrixOf(...Array.from({ length: 6 }, () => doIssue()));

    it("compares each person with their fair share: the team's load per full-time person, scaled", () => {
      const { people } = teamWeather(
        [
          { name: "Ana", matrix: six(), capacity: 0.5 },
          { name: "Ben", matrix: six() },
          { name: "Cy", matrix: matrixOf(doIssue(), doIssue(), doIssue()) },
        ],
        "issues",
        TODAY,
      );
      // 15 urgent issues over 2.5 people: 6 per full-time person, so Ana's share is 3.
      expect(people.map((p) => [p.kind, p.load, p.teamAverage])).toEqual([
        ["storm", 6, 6],
        ["cloudy", 6, 6],
        ["sunny", 3, 6],
      ]);
      expect(people[0]?.reason).toBe("6 urgent issues at half time, 2.0× their share");
      expect(people[1]?.reason).toBe("6 urgent issues, 1.0× the team average");
    });

    it("names other capacities as a percent of full time", () => {
      const { people } = teamWeather(
        [
          { name: "Ana", matrix: matrixOf(doIssue(), doIssue(), doIssue()), capacity: 0.6 },
          { name: "Ben", matrix: matrixOf(doIssue(), doIssue()) },
        ],
        "issues",
        TODAY,
      );
      // 5 over 1.6: Ana's share is 1.875, Ben's 3.125.
      expect(people[0]?.reason).toBe("3 urgent issues at 60% time, 1.6× their share");
      expect(people[1]?.reason).toBe("2 urgent issues, 0.64× the team average");
    });

    it("leaves out the capacity of anyone who can't be measured", () => {
      const { people } = teamWeather(
        [
          { name: "Ana", matrix: matrixOf(doIssue(), doIssue()) },
          { name: "Ben", matrix: matrixOf(doIssue(), doIssue()), capacity: 0.5 },
          { name: "Thor", matrix: matrixOf(undated), capacity: 0.5 },
        ],
        "issues",
        TODAY,
      );
      // 4 over 1.5, not over 2.
      expect(people[0]?.teamAverage).toBeCloseTo(4 / 1.5);
      expect(people.map((p) => p.kind)).toEqual(["cloudy", "rain", "fog"]);
    });

    it("counts the team's busiest person by their share, not by load alone", () => {
      const { team } = teamWeather(
        [
          { name: "Ana", matrix: matrixOf(doIssue(), doIssue(), doIssue()), capacity: 0.25 },
          { name: "Ben", matrix: matrixOf(doIssue(), doIssue(), doIssue(), doIssue()) },
          { name: "Cy", matrix: matrixOf(doIssue(), doIssue(), doIssue(), doIssue()) },
        ],
        "issues",
        TODAY,
      );
      expect(team).toMatchObject({ kind: "storm", load: 3, reason: "Ana is in a storm" });
    });
  });

  describe("with time off", () => {
    const away = { until: "2026-10-20" };

    it("leaves anyone away out of the fair share, and storms while they hold urgent work", () => {
      const { people, team } = teamWeather(
        [
          { name: "Ana", matrix: matrixOf(doIssue(), doIssue(), overdueDelegate), away },
          { name: "Ben", matrix: matrixOf(doIssue(), doIssue()) },
          { name: "Cy", matrix: matrixOf(doIssue(), doIssue()) },
        ],
        "issues",
        TODAY,
      );
      expect(people.map((p) => [p.kind, p.teamAverage])).toEqual([
        ["away", 2],
        ["cloudy", 2],
        ["cloudy", 2],
      ]);
      expect(people[0]?.reason).toBe("Away until Oct 20, holding 3 urgent issues (1 overdue)");
      expect(team).toMatchObject({
        kind: "storm",
        load: 2,
        overdue: 1,
        reason: "Ana is away with 3 urgent issues",
      });
    });

    it("names anyone in a storm too", () => {
      const { team } = teamWeather(
        [
          { name: "Ana", matrix: matrixOf(doIssue()), away },
          { name: "Ben", matrix: matrixOf(overdueDo) },
          { name: "Cy", matrix: matrixOf(doIssue()) },
        ],
        "issues",
        TODAY,
      );
      expect(team.reason).toBe("Ana is away with 1 urgent issue; Ben is in a storm");
    });

    it("is calm about someone away with nothing urgent", () => {
      const { people, team } = teamWeather(
        [
          { name: "Ana", matrix: matrixOf(later), away },
          { name: "Ben", matrix: matrixOf(doIssue()) },
          { name: "Cy", matrix: matrixOf(doIssue()) },
        ],
        "issues",
        TODAY,
      );
      expect(people[0]).toMatchObject({ kind: "away", reason: "Away until Oct 20" });
      expect(team).toMatchObject({ kind: "sunny", reason: "Urgent load is spread evenly" });
    });

    it("says so when everyone is away", () => {
      const { team } = teamWeather(
        [
          { name: "Ana", matrix: matrixOf(later), away },
          { name: "Ben", matrix: matrixOf(), away },
        ],
        "issues",
        TODAY,
      );
      expect(team).toMatchObject({ kind: "fog", reason: "Everyone is away" });
    });

    it("names the days off behind a lower capacity", () => {
      const { people } = teamWeather(
        [
          {
            name: "Ana",
            matrix: matrixOf(doIssue(), doIssue(), doIssue()),
            capacity: 0.6,
            daysOff: 2,
          },
          { name: "Ben", matrix: matrixOf(doIssue(), doIssue()) },
        ],
        "issues",
        TODAY,
      );
      expect(people[0]?.reason).toBe("3 urgent issues at 60% time (2 days off), 1.6× their share");
    });
  });
});
