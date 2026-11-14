import { describe, expect, it } from "vitest";
import { forecast } from "./forecast";
import { buildMatrix, type MatrixIssue, type Overrides } from "./matrix";
import { DEFAULT_RULES } from "./quadrant";

// Weeks run Oct 18–24, Oct 25–31, Nov 1–7, Nov 8–14. Under the default rules an issue turns
// urgent 13 days before it's due.
const TODAY = "2026-10-18";

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

const kinds = (weeks: { weather: { kind: string } }[]) => weeks.map((w) => w.weather.kind);

describe("forecast", () => {
  it("dates each week from today", () => {
    const { team } = forecast([person("Ana", [])], "issues", TODAY, 3);
    expect(team.map(({ startsOn, endsOn }) => [startsOn, endsOn])).toEqual([
      ["2026-10-18", "2026-10-24"],
      ["2026-10-25", "2026-10-31"],
      ["2026-11-01", "2026-11-07"],
    ]);
  });

  it("brings dated work into the load in the week it turns urgent", () => {
    // Due Nov 18: urgent from Nov 5, in the third week.
    const bunch = [issue("2026-11-18"), issue("2026-11-18"), issue("2026-11-19", 4)];
    const { people } = forecast(
      [person("Ana", bunch), person("Ben", [issue("2026-10-24"), issue("2026-11-30")])],
      "issues",
      TODAY,
      4,
    );
    const [ana, ben] = people;
    expect(ana?.map((w) => w.weather.load)).toEqual([0, 0, 3, 3]);
    expect(kinds(ana ?? [])).toEqual(["sunny", "sunny", "storm", "storm"]);
    expect(ana?.[2]?.summary).toBe("2 High-priority issues and 1 Low-priority issue become urgent");
    expect(ana?.[2]?.turningUrgent).toHaveLength(3);
    expect(ana?.[0]?.summary).toBe("Nothing new turns urgent");
    // Ben's Oct 24 issue is due the first week's last day, so it counts then and is done after;
    // his Nov 30 one turns urgent Nov 17, past the horizon.
    expect(ben?.map((w) => w.weather.load)).toEqual([1, 0, 0, 0]);
  });

  it("compares each week with everyone's fair share, scaled by capacity", () => {
    // From the third week Ana holds 3 and Ben 3: 6 over 1.5 people, so Ana's share is 2.
    const due = () => issue("2026-11-18");
    const { people } = forecast(
      [
        { ...person("Ana", [due(), due(), due()]), capacity: 0.5 },
        person("Ben", [due(), due(), due()]),
      ],
      "issues",
      TODAY,
      3,
    );
    expect(people[0]?.[2]?.weather).toMatchObject({
      kind: "rain",
      teamAverage: 4,
      reason: "3 urgent issues at half time, 1.5× their share",
    });
  });

  it("counts work as done after its due date, but keeps overdue work, and its storm", () => {
    const { people } = forecast(
      [
        person("Ana", [issue("2026-10-10")]),
        person("Ben", [issue("2026-10-24")]),
        person("Cy", [issue("2026-10-19")]),
      ],
      "issues",
      TODAY,
      2,
    );
    expect(kinds(people[0] ?? [])).toEqual(["storm", "storm"]);
    expect(people[0]?.[1]?.weather.reason).toContain("1 issue overdue");
    expect(people[1]?.map((w) => w.weather.load)).toEqual([1, 0]);
    // Due mid-week: done by the week's last day, which the weather is for.
    expect(people[2]?.map((w) => w.weather.load)).toEqual([0, 0]);
  });

  it("only counts what turns urgent later, not what is urgent already", () => {
    const { people } = forecast([person("Ana", [issue("2026-10-25")])], "issues", TODAY, 1);
    expect(people[0]?.[0]?.turningUrgent).toEqual([]);
  });

  it("keeps hand-placed issues where the PM put them", () => {
    const later = issue("2026-11-10");
    const soon = issue("2026-10-20");
    const overrides: Overrides = new Map([
      [later.id, "do"],
      [soon.id, "schedule"],
    ]);
    const { people } = forecast(
      [person("Ana", [later, soon], overrides), person("Ben", [])],
      "issues",
      TODAY,
      4,
    );
    // Urgent from now, by hand, until it's done on Nov 10; the other never turns urgent.
    expect(people[0]?.map((w) => w.weather.load)).toEqual([1, 1, 1, 0]);
    expect(people[0]?.flatMap((w) => w.turningUrgent)).toEqual([]);
  });

  it("is fog for someone holding only undated work, nudging for dates", () => {
    const { people } = forecast(
      [person("Ana", [issue(null)]), person("Ben", [issue("2026-10-20")])],
      "issues",
      TODAY,
      2,
    );
    expect(kinds(people[0] ?? [])).toEqual(["fog", "fog"]);
  });

  it("projects the team's spread each week and picks its worst", () => {
    const { team, worst } = forecast(
      [
        person("Ana", [issue("2026-10-24"), issue("2026-11-18"), issue("2026-11-18")]),
        person("Ben", [issue("2026-10-24"), issue("2026-10-24")]),
        person("Cy", [issue("2026-10-24")]),
      ],
      "issues",
      TODAY,
      4,
    );
    expect(kinds(team)).toEqual(["rain", "sunny", "storm", "storm"]);
    expect(team[2]?.weather.reason).toBe("Ana is in a storm");
    expect(team[2]?.summary).toBe("2 High-priority issues become urgent");
    expect(worst).toBe(team[2]);
  });

  it("counts points only if everything urgent in any week is estimated", () => {
    const unestimated = issue("2026-11-18", 2, null);
    const people = [person("Ana", [issue("2026-10-24"), unestimated]), person("Ben", [])];
    expect(forecast(people, null, TODAY, 4).team[0]?.weather.metric).toBe("issues");
    expect(forecast(people, null, TODAY, 2).team[0]?.weather.metric).toBe("points");
  });

  it("refuses a horizon it can't project", () => {
    expect(() => forecast([], "issues", TODAY, 0)).toThrow(RangeError);
    expect(() => forecast([], "issues", TODAY, 13)).toThrow(RangeError);
    expect(() => forecast([], "issues", TODAY, 1.5)).toThrow(RangeError);
  });
});
