import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "../domain/quadrant";
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
});
