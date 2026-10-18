import { describe, expect, it } from "vitest";
import { type ClassifiableIssue, classify, DEFAULT_RULES, type QuadrantRules } from "./quadrant";

const TODAY = "2026-10-18";
const SOON = "2026-10-21"; // 3 days out
const LATER = "2026-11-30"; // 43 days out

const run = (issue: ClassifiableIssue, rules: QuadrantRules = DEFAULT_RULES) =>
  classify(issue, rules, TODAY);

describe("classify with default rules", () => {
  it("puts important + urgent in Do", () => {
    expect(run({ priority: 2, dueDate: SOON })).toEqual({
      quadrant: "do",
      reason: "High priority, due in 3 days",
    });
  });

  it("puts important + not urgent in Schedule", () => {
    expect(run({ priority: 3, dueDate: LATER })).toEqual({
      quadrant: "schedule",
      reason: "Medium priority, due in 43 days",
    });
  });

  it("puts not important + urgent in Delegate", () => {
    expect(run({ priority: 4, dueDate: SOON })).toEqual({
      quadrant: "delegate",
      reason: "Low priority, due in 3 days",
    });
  });

  it("puts not important + not urgent in Drop", () => {
    expect(run({ priority: 4, dueDate: LATER })).toEqual({
      quadrant: "drop",
      reason: "Low priority, due in 43 days",
    });
  });

  it.each([1, 2, 3] as const)("counts priority %i as important", (priority) => {
    expect(run({ priority, dueDate: SOON }).quadrant).toBe("do");
  });

  it("treats No priority as not important", () => {
    expect(run({ priority: 0, dueDate: SOON })).toEqual({
      quadrant: "delegate",
      reason: "No priority, due in 3 days",
    });
  });

  it("is urgent at 13 days and not urgent at exactly 14", () => {
    expect(run({ priority: 1, dueDate: "2026-10-31" }).quadrant).toBe("do");
    expect(run({ priority: 1, dueDate: "2026-11-01" })).toEqual({
      quadrant: "schedule",
      reason: "Urgent priority, due in 14 days",
    });
  });

  it("treats due today as urgent", () => {
    expect(run({ priority: 3, dueDate: TODAY })).toEqual({
      quadrant: "do",
      reason: "Medium priority, due today",
    });
  });

  it("treats overdue as urgent", () => {
    expect(run({ priority: 3, dueDate: "2026-10-17" })).toEqual({
      quadrant: "do",
      reason: "Medium priority, overdue by 1 day",
    });
    expect(run({ priority: 4, dueDate: "2026-09-18" })).toEqual({
      quadrant: "delegate",
      reason: "Low priority, overdue by 30 days",
    });
  });

  it("treats no due date as not urgent", () => {
    expect(run({ priority: 2, dueDate: null })).toEqual({
      quadrant: "schedule",
      reason: "High priority, no due date",
    });
    expect(run({ priority: 0, dueDate: null }).quadrant).toBe("drop");
  });

  it("counts calendar days across a DST change", () => {
    // Europe and the US leave DST between these dates.
    expect(
      classify({ priority: 3, dueDate: "2026-11-08" }, DEFAULT_RULES, "2026-10-25").reason,
    ).toBe("Medium priority, due in 14 days");
  });

  it("rejects a malformed date", () => {
    expect(() => run({ priority: 3, dueDate: "2026-10-18T00:00:00Z" })).toThrow(RangeError);
  });
});

describe("classify with custom rules", () => {
  it("can treat no due date as urgent", () => {
    const rules: QuadrantRules = { ...DEFAULT_RULES, noDueDate: "urgent" };
    expect(run({ priority: 2, dueDate: null }, rules)).toEqual({
      quadrant: "do",
      reason: "High priority, no due date",
    });
    expect(run({ priority: 4, dueDate: null }, rules).quadrant).toBe("delegate");
  });

  it("honours a stricter priority threshold", () => {
    const rules: QuadrantRules = { ...DEFAULT_RULES, importantFrom: 2 };
    expect(run({ priority: 2, dueDate: SOON }, rules).quadrant).toBe("do");
    expect(run({ priority: 3, dueDate: SOON }, rules).quadrant).toBe("delegate");
  });

  it("honours a different urgency window", () => {
    const rules: QuadrantRules = { ...DEFAULT_RULES, urgencyWindowDays: 3 };
    expect(run({ priority: 2, dueDate: "2026-10-20" }, rules).quadrant).toBe("do");
    expect(run({ priority: 2, dueDate: SOON }, rules).quadrant).toBe("schedule");
  });
});
