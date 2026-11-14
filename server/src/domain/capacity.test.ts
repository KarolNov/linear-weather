import { describe, expect, it } from "vitest";
import { describeCapacity, FULL_TIME, parseCapacity } from "./capacity";

describe("parseCapacity", () => {
  it.each([0.5, 0.25, 0.01, 1])("takes %d", (factor) => {
    expect(parseCapacity(factor)).toEqual({ factor });
  });

  it("keeps it to hundredths, as a percent of full time", () => {
    expect(parseCapacity(1 / 3)).toEqual({ factor: 0.33 });
    expect(parseCapacity(0.999)).toEqual({ factor: 1 });
  });

  it.each([0, -0.5, 1.2, 0.004, Number.NaN, Number.POSITIVE_INFINITY])(
    "turns away %d: more than 0, and at most full time",
    (factor) => {
      expect(parseCapacity(factor)).toEqual({
        problem: "Capacity is a share of full time: more than 0, up to 1.",
      });
    },
  );
});

describe("describeCapacity", () => {
  it.each([
    [FULL_TIME, "full time"],
    [0.5, "half time"],
    [0.6, "60% time"],
    [0.33, "33% time"],
  ])("calls %d %s", (factor, words) => {
    expect(describeCapacity(factor)).toBe(words);
  });
});
