import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "../domain/quadrant";
import { DemoStore } from "./demo-store";

const strict = { importantFrom: 2, urgencyWindowDays: 7, noDueDate: "urgent" } as const;

describe("DemoStore", () => {
  it("starts from the defaults without a cookie", async () => {
    const store = DemoStore.fromCookie(undefined);
    expect(await store.rules(["team"])).toEqual(new Map([["team", DEFAULT_RULES]]));
    expect(await store.overrides(["issue"])).toEqual(new Map());
    expect(store.changed).toBe(false);
  });

  it("reads back what it wrote to its cookie", async () => {
    const before = DemoStore.fromCookie(undefined);
    await before.setRules("team", strict);
    await before.setOverride("issue-1", "drop");
    await before.setOverride("issue-2", "do");
    await before.clearOverride("issue-2");
    expect(before.changed).toBe(true);

    const after = DemoStore.fromCookie(before.cookie());
    expect(await after.rules(["team", "other"])).toEqual(
      new Map([
        ["team", strict],
        ["other", DEFAULT_RULES],
      ]),
    );
    expect(await after.overrides(["issue-1", "issue-2"])).toEqual(new Map([["issue-1", "drop"]]));
  });

  it("hasn't changed after clearing an issue that was never placed", async () => {
    const store = DemoStore.fromCookie(undefined);
    await store.clearOverride("issue");
    expect(store.changed).toBe(false);
  });

  it("drops whatever in the cookie isn't valid rules or a quadrant", async () => {
    const cookie = JSON.stringify({
      rules: {
        ok: strict,
        zero: { ...strict, urgencyWindowDays: 0 },
        priority: { ...strict, importantFrom: 0 },
        text: { ...strict, urgencyWindowDays: "7" },
        undated: { ...strict, noDueDate: "sometimes" },
        missing: { importantFrom: 2 },
        array: [2, 7, "urgent"],
      },
      overrides: { ok: "schedule", bad: "later", number: 1, nothing: null },
    });
    const store = DemoStore.fromCookie(cookie);
    const teams = ["ok", "zero", "priority", "text", "undated", "missing", "array"];
    expect(await store.rules(teams)).toEqual(
      new Map(teams.map((id) => [id, id === "ok" ? strict : DEFAULT_RULES])),
    );
    expect(await store.overrides(["ok", "bad", "number", "nothing"])).toEqual(
      new Map([["ok", "schedule"]]),
    );
  });

  it.each([
    ["not JSON", "{"],
    ["not an object", "[1,2]"],
    ["too long", JSON.stringify({ overrides: { x: "do" }, pad: "x".repeat(5000) })],
  ])("ignores a cookie that's %s", async (_case, cookie) => {
    const store = DemoStore.fromCookie(cookie);
    expect(await store.overrides(["x"])).toEqual(new Map());
  });
});
