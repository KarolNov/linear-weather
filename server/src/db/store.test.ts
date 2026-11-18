import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "../domain/quadrant";
import { MAX_TIME_OFF, type TimeOff } from "../domain/time-off";
import { Store } from "./store";

const store = () => new Store(env.DB);

describe("Store", () => {
  it("gives the default rules to a team that never changed them", async () => {
    expect(await store().rules(["team-new"])).toEqual(new Map([["team-new", DEFAULT_RULES]]));
  });

  it("keeps a team's rules, and replaces them on the next save", async () => {
    const rules = {
      importantFrom: 2,
      urgencyWindowDays: 7,
      noDueDate: "urgent",
      dropAlertPercent: 25,
      awayStatuses: ["🌴", "vacation"],
      blockersAreImportant: true,
    } as const;
    await store().setRules("team-a", rules);
    expect(await store().rules(["team-a"])).toEqual(new Map([["team-a", rules]]));
    await store().setRules("team-a", { ...rules, urgencyWindowDays: 21 });
    expect(await store().rules(["team-a", "team-b"])).toEqual(
      new Map([
        ["team-a", { ...rules, urgencyWindowDays: 21 }],
        ["team-b", DEFAULT_RULES],
      ]),
    );
  });

  it.each([
    { urgencyWindowDays: 0 },
    // GraphQL's Int couldn't send these back.
    { urgencyWindowDays: 1.5 },
    { importantFrom: 2.5 as 2 },
  ])("refuses rules the board couldn't use: %o", async (bad) => {
    const failed = store().setRules("team-a", { ...DEFAULT_RULES, ...bad });
    // Drizzle wraps D1's error.
    await expect(failed).rejects.toMatchObject({
      cause: { message: expect.stringContaining("CHECK constraint failed") },
    });
  });

  it("finds overrides among the issues asked about, and forgets cleared ones", async () => {
    await store().setOverride("issue-1", "drop");
    await store().setOverride("issue-2", "schedule");
    await store().setOverride("issue-2", "do");
    expect(await store().overrides(["issue-1", "issue-2", "issue-3"])).toEqual(
      new Map([
        ["issue-1", "drop"],
        ["issue-2", "do"],
      ]),
    );
    await store().clearOverride("issue-1");
    expect(await store().overrides(["issue-1", "issue-2"])).toEqual(new Map([["issue-2", "do"]]));
    expect(await store().overrides([])).toEqual(new Map());
  });

  it("looks up more issues than D1 binds parameters in one statement", async () => {
    const ids = Array.from({ length: 2_500 }, (_, i) => `issue-${i}`);
    await store().setOverride("issue-0", "do");
    await store().setOverride("issue-2499", "drop");
    expect(await store().overrides(ids)).toEqual(
      new Map([
        ["issue-0", "do"],
        ["issue-2499", "drop"],
      ]),
    );
  });

  it("keeps who works part time, and forgets anyone set back to full time", async () => {
    await store().setCapacity("user-ana", 0.5);
    await store().setCapacity("user-ben", 0.8);
    await store().setCapacity("user-ben", 0.6);
    expect(await store().capacities(["user-ana", "user-ben", "user-cy"])).toEqual(
      new Map([
        ["user-ana", 0.5],
        ["user-ben", 0.6],
      ]),
    );
    await store().setCapacity("user-ana", 1);
    expect(await store().capacities(["user-ana", "user-ben"])).toEqual(
      new Map([["user-ben", 0.6]]),
    );
    expect(await store().capacities([])).toEqual(new Map());
  });

  it("keeps each person's time off, soonest first, and removes only their own", async () => {
    const add = async (userId: string, startsOn: string, endsOn: string) =>
      (await store().addTimeOff(userId, startsOn, endsOn, "2026-11-01")) as TimeOff;
    const later = await add("user-ana", "2026-12-21", "2026-12-31");
    const sooner = await add("user-ana", "2026-11-16", "2026-11-20");
    const bens = await add("user-ben", "2026-11-16", "2026-11-16");
    expect(await store().timeOff(["user-ana", "user-ben", "user-cy"])).toEqual(
      new Map([
        ["user-ana", [sooner, later]],
        ["user-ben", [bens]],
      ]),
    );
    expect(await store().removeTimeOff("user-ana", bens.id)).toBe(false);
    expect(await store().removeTimeOff("user-ana", sooner.id)).toBe(true);
    expect(await store().timeOff(["user-ana"])).toEqual(new Map([["user-ana", [later]]]));
    expect(await store().timeOff([])).toEqual(new Map());
  });

  it("refuses time off past the most anyone can have coming up, and forgets what's over", async () => {
    const past = await store().addTimeOff("user-ana", "2026-10-01", "2026-10-02", "2026-10-01");
    for (let i = 0; i < MAX_TIME_OFF; i++) {
      const day = `2026-11-${10 + i}`;
      expect(await store().addTimeOff("user-ana", day, day, "2026-11-01")).not.toBeNull();
    }
    expect(await store().addTimeOff("user-ana", "2026-12-01", "2026-12-01", "2026-11-01")).toBe(
      null,
    );
    const kept = (await store().timeOff(["user-ana"])).get("user-ana") ?? [];
    expect(kept).toHaveLength(MAX_TIME_OFF);
    expect(kept).not.toContainEqual(past);
  });

  it.each([
    ["2026-11-20", "2026-11-16"],
    ["2026-11-16", "next week"],
  ])("refuses time off from %s to %s", async (startsOn, endsOn) => {
    await expect(
      store().addTimeOff("user-ana", startsOn, endsOn, "2026-11-01"),
    ).rejects.toMatchObject({
      cause: { message: expect.stringContaining("CHECK constraint failed") },
    });
  });

  it.each([0, -0.5, 1.5])("refuses a capacity of %d", async (factor) => {
    await expect(store().setCapacity("user-ana", factor)).rejects.toMatchObject({
      cause: { message: expect.stringContaining("CHECK constraint failed") },
    });
  });
});
