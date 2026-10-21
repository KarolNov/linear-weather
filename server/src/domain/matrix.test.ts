import { describe, expect, it } from "vitest";
import { buildMatrix, counts, type MatrixIssue, place, points } from "./matrix";
import { DEFAULT_RULES } from "./quadrant";

const TODAY = "2026-10-18";

const issue = (id: string, fields: MatrixIssue) => ({ id, ...fields });

describe("place", () => {
  it("keeps the issue and adds where it landed, why, and when it turns urgent", () => {
    expect(place(issue("a", { priority: 2, dueDate: "2026-11-30" }), DEFAULT_RULES, TODAY)).toEqual(
      {
        id: "a",
        priority: 2,
        dueDate: "2026-11-30",
        quadrant: "schedule",
        quadrantSource: "rule",
        placementReason: "High priority, due in 43 days",
        becomesUrgentOn: "2026-11-17",
      },
    );
  });

  it("puts an overridden issue where the PM put it, saying where the rules would", () => {
    const placed = place(
      issue("a", { priority: 2, dueDate: "2026-11-30" }),
      DEFAULT_RULES,
      TODAY,
      "drop",
    );
    expect(placed).toMatchObject({
      quadrant: "drop",
      quadrantSource: "override",
      placementReason: "Placed by hand; the rules say Schedule (High priority, due in 43 days)",
      // Moving it doesn't change when its due date makes it urgent.
      becomesUrgentOn: "2026-11-17",
    });
  });
});

describe("buildMatrix", () => {
  it("sorts each quadrant by due date, undated last, then by priority", () => {
    const matrix = buildMatrix(
      [
        issue("undated-urgent", { priority: 1, dueDate: null }),
        issue("no-priority", { priority: 0, dueDate: "2026-10-20" }),
        issue("low", { priority: 4, dueDate: "2026-10-20" }),
        issue("sooner", { priority: 4, dueDate: "2026-10-19" }),
        issue("high", { priority: 2, dueDate: "2026-10-20" }),
      ],
      DEFAULT_RULES,
      TODAY,
    );
    expect(matrix.do.map((i) => i.id)).toEqual(["high"]);
    expect(matrix.delegate.map((i) => i.id)).toEqual(["sooner", "low", "no-priority"]);
    expect(matrix.schedule.map((i) => i.id)).toEqual(["undated-urgent"]);
    expect(matrix.drop).toEqual([]);
  });

  it("files overridden issues under their override, keeping the most pressing first", () => {
    const matrix = buildMatrix(
      [
        issue("later", { priority: 2, dueDate: "2026-10-25" }),
        issue("moved", { priority: 4, dueDate: "2026-10-20" }),
        issue("ruled", { priority: 4, dueDate: "2026-10-19" }),
      ],
      DEFAULT_RULES,
      TODAY,
      new Map([["moved", "do"]]),
    );
    expect(matrix.do.map((i) => [i.id, i.quadrantSource])).toEqual([
      ["moved", "override"],
      ["later", "rule"],
    ]);
    expect(matrix.delegate.map((i) => i.id)).toEqual(["ruled"]);
  });
});

describe("counts and points", () => {
  it("tally issues and estimates per quadrant, unestimated issues adding no points", () => {
    const matrix = buildMatrix(
      [
        issue("a", { priority: 1, dueDate: TODAY, estimate: 3 }),
        issue("b", { priority: 1, dueDate: TODAY, estimate: 0.5 }),
        issue("c", { priority: 4, dueDate: null, estimate: null }),
        issue("d", { priority: 4, dueDate: null }),
      ],
      DEFAULT_RULES,
      TODAY,
    );
    expect(counts(matrix)).toEqual({ do: 2, schedule: 0, delegate: 0, drop: 2 });
    expect(points(matrix)).toEqual({ do: 3.5, schedule: 0, delegate: 0, drop: 0 });
  });
});
