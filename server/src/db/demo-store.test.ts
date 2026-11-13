import { generateCookie } from "hono/cookie";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, MAX_URGENCY_WINDOW_DAYS } from "../domain/quadrant";
import { DEMO_OPS_TEAM, DEMO_TEAM, demoIssues } from "../linear/demo";
import { DEMO_COOKIE, DEMO_COOKIE_MAX_AGE, decodeDemo, MAX_COOKIE_LENGTH } from "./demo-cookie";
import { DemoStore } from "./demo-store";

const strict = {
  importantFrom: 2,
  urgencyWindowDays: 7,
  noDueDate: "urgent",
  dropAlertPercent: DEFAULT_RULES.dropAlertPercent,
} as const;
const team = DEMO_TEAM.id;
const [first, second] = ["demo-issue-avg-1", "demo-issue-avg-2"];

describe("DemoStore", () => {
  it("starts from the defaults without a cookie", async () => {
    const store = DemoStore.fromCookie(undefined);
    expect(await store.rules([team])).toEqual(new Map([[team, DEFAULT_RULES]]));
    expect(await store.overrides([first])).toEqual(new Map());
    expect(store.changed).toBe(false);
  });

  it("reads back what it wrote to its cookie", async () => {
    const before = DemoStore.fromCookie(undefined);
    await before.setRules(team, strict);
    await before.setOverride(first, "drop");
    await before.setOverride(second, "do");
    await before.clearOverride(second);
    expect(before.changed).toBe(true);
    expect(before.cookie()).toBe("1~avengers.2.7.0~avg-1.3");

    const after = DemoStore.fromCookie(before.cookie());
    expect(await after.rules([team, DEMO_OPS_TEAM.id])).toEqual(
      new Map([
        [team, strict],
        [DEMO_OPS_TEAM.id, DEFAULT_RULES],
      ]),
    );
    expect(await after.overrides([first, second])).toEqual(new Map([[first, "drop"]]));
  });

  it("keeps a Drop alert other than the default, and reads cookies from before it", async () => {
    const before = DemoStore.fromCookie(undefined);
    await before.setRules(team, { ...strict, dropAlertPercent: 25 });
    expect(before.cookie()).toBe("1~avengers.2.7.0.25~");
    const after = DemoStore.fromCookie(before.cookie());
    expect(await after.rules([team])).toEqual(
      new Map([[team, { ...strict, dropAlertPercent: 25 }]]),
    );
    expect(decodeDemo("1~avengers.2.7.0~").rules.get(team)).toEqual(strict);
  });

  it("keeps who the visitor handed issues to, and forgets those handed back", async () => {
    const before = DemoStore.fromCookie(undefined);
    before.setAssignee("demo-issue-avg-10", "demo-user-wanda");
    before.setAssignee("demo-issue-ops-1", "demo-user-maria");
    before.setAssignee("demo-issue-ops-1", null);
    expect(before.changed).toBe(true);
    expect(before.cookie()).toBe("1~~~avg-10.wanda");

    const after = DemoStore.fromCookie(before.cookie());
    expect(after.assignee("demo-issue-avg-10")).toBe("demo-user-wanda");
    expect(after.assignee("demo-issue-ops-1")).toBeUndefined();
    expect(after.changed).toBe(false);
  });

  it("has changed after handing back an issue its cookie had handed over", () => {
    const store = DemoStore.fromCookie("1~~~avg-10.wanda");
    store.setAssignee("demo-issue-avg-10", null);
    expect(store.changed).toBe(true);
    expect(store.cookie()).toBe("1~~");
  });

  it("hasn't changed after handing back an issue that was never handed over", () => {
    const store = DemoStore.fromCookie(undefined);
    store.setAssignee("demo-issue-avg-10", null);
    expect(store.changed).toBe(false);
  });

  it("keeps nothing for rules set back to the defaults", async () => {
    const store = DemoStore.fromCookie("1~avengers.2.7.0~");
    await store.setRules(team, DEFAULT_RULES);
    expect(store.cookie()).toBe("1~~");
  });

  it("won't answer success for an id its cookie can't hold", async () => {
    const store = DemoStore.fromCookie(undefined);
    await store.setOverride("demo-issue-AVG_1", "drop");
    expect(() => store.cookie()).toThrow("can't hold");
  });

  it("hasn't changed after clearing an issue that was never placed", async () => {
    const store = DemoStore.fromCookie(undefined);
    await store.clearOverride(first);
    expect(store.changed).toBe(false);
  });

  it("fits the whole demo in one cookie: every issue placed and handed over, every team's rules changed", async () => {
    const store = DemoStore.fromCookie(undefined);
    for (const { id } of [DEMO_TEAM, DEMO_OPS_TEAM]) {
      await store.setRules(id, { ...strict, urgencyWindowDays: MAX_URGENCY_WINDOW_DAYS });
      for (const issue of demoIssues("2026-10-18", id)) {
        await store.setOverride(issue.id, "drop");
        // The longest id that's a member of both teams.
        store.setAssignee(issue.id, "demo-user-natasha");
      }
    }
    const cookie = generateCookie(DEMO_COOKIE, store.cookie(), {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: DEMO_COOKIE_MAX_AGE,
    });
    expect(cookie.length).toBeLessThanOrEqual(MAX_COOKIE_LENGTH);
    expect(decodeDemo(store.cookie()).overrides.size).toBe(
      demoIssues("2026-10-18", DEMO_TEAM.id).length +
        demoIssues("2026-10-18", DEMO_OPS_TEAM.id).length,
    );
  });
});

describe("decodeDemo", () => {
  it("drops whatever in the cookie isn't valid rules or a quadrant for the demo", () => {
    const rules = [
      "avengers.2.7.0",
      "ops.2.0.0",
      "ops.0.7.0",
      "ops.2.7.5.0",
      "ops.2.7.0.0",
      "ops.2.7.0.100",
      "ops.2.7.0.4x",
      "ops.2.7.0.25.1",
      "ops.2.7.2",
      "x.2.7.0",
    ];
    const overrides = ["avg-1.1", "avg-2.4", "avg-3.do", "AVG-4.1", "avg-5.1.1", "avg-6", "x-1.1"];
    const saved = decodeDemo(`1~${rules.join("!")}~${overrides.join("!")}`);
    expect(saved.rules).toEqual(new Map([[team, strict]]));
    expect(saved.overrides).toEqual(new Map([[first, "schedule"]]));
  });

  it("drops whoever in the cookie isn't a demo user holding a demo issue", () => {
    const assignees = ["avg-10.wanda", "avg-11.nobody", "x-1.steve", "avg-12", "avg-13.steve.1"];
    expect(decodeDemo(`1~~~${assignees.join("!")}`).assignees).toEqual(
      new Map([["demo-issue-avg-10", "demo-user-wanda"]]),
    );
  });

  it.each([
    ["empty", ""],
    ["from another version", "2~avengers.2.7.0~avg-1.3"],
    ["not ours", '{"overrides":{"demo-issue-avg-1":"drop"}}'],
    ["too long", `1~~avg-1.3!${"x".repeat(MAX_COOKIE_LENGTH)}`],
  ])("reads a cookie that's %s as nothing saved", (_case, cookie) => {
    expect(decodeDemo(cookie)).toEqual({
      rules: new Map(),
      overrides: new Map(),
      assignees: new Map(),
    });
  });
});
