import { describe, expect, it } from "vitest";
import { backlogRot } from "./backlog";

const counts = (doN: number, schedule: number, delegate: number, drop: number) => ({
  do: doN,
  schedule,
  delegate,
  drop,
});

describe("backlogRot", () => {
  it("adds up Drop across every matrix of the team", () => {
    expect(backlogRot([counts(1, 1, 0, 3), counts(0, 2, 1, 4)], 40)).toEqual({
      drop: 7,
      total: 12,
      share: 7 / 12,
      alertPercent: 40,
      rotting: true,
      reason: "7 of 12 open issues (58%) are in Drop, over the team's 40% alert",
    });
  });

  it("flags only above the threshold, compared as the whole percent it shows", () => {
    expect(backlogRot([counts(3, 0, 0, 2)], 40).rotting).toBe(false); // exactly 40%
    expect(backlogRot([counts(3, 0, 0, 2)], 39).rotting).toBe(true);
    // 400/1001 is 39.96%, shown as 40%: not over a 40% alert.
    expect(backlogRot([counts(601, 0, 0, 400)], 40)).toMatchObject({
      rotting: false,
      reason: "400 of 1001 open issues (40%) are in Drop, within the team's 40% alert",
    });
  });

  it("is quiet for a team with no open issues", () => {
    expect(backlogRot([], 40)).toMatchObject({
      drop: 0,
      total: 0,
      share: 0,
      rotting: false,
      reason: "No open issues",
    });
  });

  it("speaks of one issue in the singular", () => {
    expect(backlogRot([counts(0, 0, 0, 1)], 40).reason).toBe(
      "1 of 1 open issue (100%) is in Drop, over the team's 40% alert",
    );
  });
});
