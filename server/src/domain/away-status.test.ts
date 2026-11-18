import { describe, expect, it } from "vitest";
import { emojisIn, isAwayStatus, lastDay, STATUS_TIME_OFF_ID, statusTimeOff } from "./away-status";
import { describeAway, staffingFor, staffingOn, type TimeOff } from "./time-off";

// A Wednesday.
const TODAY = "2026-11-18";

const vacation = {
  statusEmoji: "🌴",
  statusLabel: "On vacation",
  statusUntilAt: "2026-11-20T23:30:00.000Z",
  timezone: "Europe/Zagreb",
};

describe("isAwayStatus", () => {
  it("matches the emoji exactly, or text in the label, ignoring case", () => {
    expect(isAwayStatus(vacation, ["🌴"])).toBe(true);
    expect(isAwayStatus(vacation, ["VACATION"])).toBe(true);
    expect(isAwayStatus(vacation, ["sick", "on vac"])).toBe(true);
  });

  it("doesn't match anything else", () => {
    expect(isAwayStatus(vacation, [])).toBe(false);
    expect(isAwayStatus(vacation, ["sick"])).toBe(false);
    // A status's emoji has to be one of the entry's, not part of one.
    expect(isAwayStatus({ ...vacation, statusEmoji: "🏖️" }, ["🌴"])).toBe(false);
    expect(isAwayStatus({ ...vacation, statusEmoji: "🧑‍💻" }, ["🧑"])).toBe(false);
    expect(isAwayStatus({ statusEmoji: null, statusLabel: null }, ["vacation"])).toBe(false);
    expect(isAwayStatus(vacation, ["  "])).toBe(false);
  });
});

describe("isAwayStatus with several emojis in one entry", () => {
  const status = (statusEmoji: string) => ({ statusEmoji, statusLabel: "Out" });

  it.each(["🌴🏖️✈️", "🌴 🏖️ ✈️", "🌴, 🏖️, ✈️"])("matches any emoji listed in %s", (entry) => {
    expect(isAwayStatus(status("🏖️"), [entry])).toBe(true);
    expect(isAwayStatus(status("✈️"), [entry])).toBe(true);
    expect(isAwayStatus(status("🤒"), [entry])).toBe(false);
  });

  it("keeps emojis built of several parts whole", () => {
    expect(isAwayStatus(status("🧑‍💻"), ["🌴🧑‍💻"])).toBe(true);
    expect(isAwayStatus(status("👋🏽"), ["🌴👋🏽"])).toBe(true);
    expect(isAwayStatus(status("🇭🇷"), ["🌴🇭🇷"])).toBe(true);
    expect(isAwayStatus(status("🇭🇷"), ["🇭🇺🇷🇸"])).toBe(false);
  });

  it("matches Linear shortcodes too", () => {
    expect(isAwayStatus(status(":palm_tree:"), [":airplane: :palm_tree:"])).toBe(true);
  });
});

describe("emojisIn", () => {
  it("lists an entry's emojis", () => {
    expect(emojisIn("🌴🏖️ ✈️")).toEqual(["🌴", "🏖️", "✈️"]);
  });

  it("is null for an entry with words, so it's searched in the label instead", () => {
    expect(emojisIn("🌴 vacation")).toBeNull();
    expect(emojisIn("sick")).toBeNull();
    expect(emojisIn("2")).toBeNull();
  });
});

describe("lastDay", () => {
  it("is the date it clears in their time zone", () => {
    // 23:30 UTC on Nov 20 is already Nov 21 in Zagreb, but Nov 20 in New York.
    expect(lastDay("2026-11-20T23:30:00.000Z", "Europe/Zagreb")).toBe("2026-11-21");
    expect(lastDay("2026-11-20T23:30:00.000Z", "America/New_York")).toBe("2026-11-20");
  });

  it("is the day before, for a status that clears at midnight", () => {
    // Midnight in Zagreb is 23:00 UTC the day before.
    expect(lastDay("2026-11-20T23:00:00.000Z", "Europe/Zagreb")).toBe("2026-11-20");
    expect(lastDay("2026-11-21T00:00:00.000Z", "Europe/London")).toBe("2026-11-20");
  });

  it("falls back to UTC without a zone it knows", () => {
    expect(lastDay("2026-11-20T23:00:00.000Z", null)).toBe("2026-11-20");
    expect(lastDay("2026-11-20T23:00:00.000Z", "Mars/Olympus")).toBe("2026-11-20");
  });

  it("is null for something that isn't a date-time", () => {
    expect(lastDay("soon", "UTC")).toBeNull();
  });
});

describe("statusTimeOff", () => {
  it("is away from today to the day it clears", () => {
    expect(statusTimeOff(vacation, ["vacation"], TODAY)).toEqual({
      id: STATUS_TIME_OFF_ID,
      startsOn: TODAY,
      endsOn: "2026-11-21",
      source: "Linear status 🌴 On vacation",
    });
  });

  it("is away this week only when the status has no end date", () => {
    expect(statusTimeOff({ ...vacation, statusUntilAt: null }, ["🌴"], TODAY)).toEqual({
      id: STATUS_TIME_OFF_ID,
      startsOn: TODAY,
      endsOn: "2026-11-24",
      source: "Linear status 🌴 On vacation; status has no end date",
    });
  });

  it("is nothing for a status the team doesn't list, or one already over", () => {
    expect(statusTimeOff(vacation, [], TODAY)).toBeNull();
    expect(statusTimeOff(vacation, ["sick"], TODAY)).toBeNull();
    expect(
      statusTimeOff({ ...vacation, statusUntilAt: "2026-11-17T12:00:00Z" }, ["🌴"], TODAY),
    ).toBeNull();
  });

  it("names just the label when there's no emoji", () => {
    const sick = { statusLabel: "Out sick", statusUntilAt: "2026-11-19T12:00:00Z" };
    expect(statusTimeOff(sick, ["sick"], TODAY)?.source).toBe("Linear status Out sick");
  });
});

describe("away by status, with time off", () => {
  const status = statusTimeOff(vacation, ["🌴"], TODAY) as TimeOff;
  const added: TimeOff = { id: "t1", startsOn: "2026-11-23", endsOn: "2026-11-27" };

  it("names the status as what says they're away", () => {
    const { away } = staffingOn(1, [status], TODAY);
    expect(away && describeAway(away)).toBe("Away until Nov 21 (Linear status 🌴 On vacation)");
  });

  it("is away whenever either says so, naming both when they run together", () => {
    // The status runs to Saturday and time off starts Monday: one stretch away.
    const { away } = staffingOn(1, [added, status], TODAY);
    expect(away && describeAway(away)).toBe(
      "Away until Nov 27 (time off and Linear status 🌴 On vacation)",
    );
    // Time off on its own still reads as it always has.
    const later = staffingOn(1, [added, status], "2026-11-24");
    expect(later.away && describeAway(later.away)).toBe("Away until Nov 27");
  });

  it("is away for the forecast's first week when the status has no end date", () => {
    const open = statusTimeOff({ ...vacation, statusUntilAt: null }, ["🌴"], TODAY) as TimeOff;
    const first = staffingFor(1, [open], TODAY, "2026-11-24");
    expect(first.away && describeAway(first.away)).toBe(
      "Away until Nov 24 (Linear status 🌴 On vacation; status has no end date)",
    );
    expect(staffingFor(1, [open], "2026-11-25", "2026-12-01")).toEqual({ capacity: 1 });
  });
});
