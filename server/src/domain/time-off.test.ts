import { describe, expect, it } from "vitest";
import {
  awayUntil,
  describeStaffing,
  parseTimeOff,
  shortDate,
  staffingFor,
  staffingOn,
  type TimeOff,
  upcoming,
} from "./time-off";

// Oct 18 2026 is a Sunday: the week to Oct 24 has its working days on Oct 19–23.
const TODAY = "2026-10-18";

let next = 0;
const off = (startsOn: string, endsOn: string): TimeOff => ({
  id: `t${next++}`,
  startsOn,
  endsOn,
});

describe("parseTimeOff", () => {
  it("takes real dates, in order, not over yet", () => {
    expect(parseTimeOff("2026-10-19", "2026-10-23", TODAY)).toEqual({
      startsOn: "2026-10-19",
      endsOn: "2026-10-23",
    });
    expect(parseTimeOff("2026-10-10", "2026-10-18", TODAY)).toEqual({
      startsOn: "2026-10-10",
      endsOn: "2026-10-18",
    });
  });

  it.each([
    ["2026-02-30", "2026-03-02", "Time off needs real dates, as YYYY-MM-DD."],
    ["2026-10-23", "2026-10-19", "Time off can't end before it starts."],
    ["2026-10-01", "2026-10-17", "That time off is already over."],
    ["2026-10-19", "2027-10-20", "One stretch of time off covers at most 366 days."],
  ])("turns away %s to %s", (startsOn, endsOn, problem) => {
    expect(parseTimeOff(startsOn, endsOn, TODAY)).toEqual({ problem });
  });
});

describe("upcoming", () => {
  it("keeps what isn't over, soonest first", () => {
    const later = off("2026-11-02", "2026-11-06");
    const now = off("2026-10-16", "2026-10-20");
    expect(upcoming([later, off("2026-10-01", "2026-10-17"), now], TODAY)).toEqual([now, later]);
  });
});

describe("awayUntil", () => {
  it("is the last day of the time off a day falls in", () => {
    expect(awayUntil([off("2026-10-19", "2026-10-21")], "2026-10-20")).toBe("2026-10-21");
    expect(awayUntil([off("2026-10-19", "2026-10-21")], "2026-10-22")).toBeNull();
  });

  it("joins stretches that meet, overlap or only have a weekend between them", () => {
    const timeOff = [
      off("2026-10-19", "2026-10-23"),
      off("2026-10-26", "2026-10-28"),
      off("2026-10-27", "2026-10-29"),
      off("2026-10-30", "2026-10-30"),
      off("2026-11-03", "2026-11-04"),
    ];
    // Mon Nov 2 is a working day back.
    expect(awayUntil(timeOff, "2026-10-20")).toBe("2026-10-30");
  });
});

describe("staffing", () => {
  it("is away on a day off, at their capacity either way", () => {
    const timeOff = [off("2026-10-16", "2026-10-20")];
    expect(staffingOn(0.5, timeOff, TODAY)).toEqual({
      capacity: 0.5,
      away: { until: "2026-10-20" },
    });
    expect(staffingOn(0.5, timeOff, "2026-10-21")).toEqual({ capacity: 0.5 });
  });

  it("lowers a week's capacity by the working days off", () => {
    // Two of Oct 19–23 off; the weekend doesn't count.
    const timeOff = [off("2026-10-17", "2026-10-20")];
    expect(staffingFor(1, timeOff, TODAY, "2026-10-24")).toEqual({ capacity: 0.6, daysOff: 2 });
    expect(staffingFor(0.5, timeOff, TODAY, "2026-10-24")).toEqual({ capacity: 0.3, daysOff: 2 });
  });

  it("is away a week whose working days are all off", () => {
    const timeOff = [off("2026-10-19", "2026-10-23"), off("2026-10-26", "2026-10-27")];
    expect(staffingFor(1, timeOff, TODAY, "2026-10-24")).toEqual({
      capacity: 1,
      away: { until: "2026-10-27" },
    });
  });

  it("is untouched by time off on a weekend or outside the week", () => {
    const timeOff = [off("2026-10-24", "2026-10-25"), off("2026-11-02", "2026-11-06")];
    expect(staffingFor(0.8, timeOff, TODAY, "2026-10-24")).toEqual({ capacity: 0.8 });
    expect(staffingFor(undefined, undefined, TODAY, "2026-10-24")).toEqual({ capacity: 1 });
  });
});

describe("describing", () => {
  it("names a date and a reduced week", () => {
    expect(shortDate("2026-11-20")).toBe("Nov 20");
    expect(describeStaffing(1)).toBe("");
    expect(describeStaffing(0.5)).toBe(" at half time");
    expect(describeStaffing(0.6, 2)).toBe(" at 60% time (2 days off)");
    expect(describeStaffing(0.8, 1)).toBe(" at 80% time (1 day off)");
  });
});
