import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "../domain/quadrant";
import { Store } from "./store";

const store = () => new Store(env.DB);

describe("Store", () => {
  it("gives the default rules to a team that never changed them", async () => {
    expect(await store().rules("team-new")).toEqual(DEFAULT_RULES);
  });

  it("keeps a team's rules, and replaces them on the next save", async () => {
    const rules = { importantFrom: 2, urgencyWindowDays: 7, noDueDate: "urgent" } as const;
    await store().setRules("team-a", rules);
    expect(await store().rules("team-a")).toEqual(rules);
    await store().setRules("team-a", { ...rules, urgencyWindowDays: 21 });
    expect(await store().rules("team-a")).toEqual({ ...rules, urgencyWindowDays: 21 });
    expect(await store().rules("team-b")).toEqual(DEFAULT_RULES);
  });

  it("refuses rules the matrix couldn't use", async () => {
    const failed = store().setRules("team-a", { ...DEFAULT_RULES, urgencyWindowDays: 0 });
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

  it("looks up more issues than D1 binds in one statement", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `issue-${i}`);
    await store().setOverride("issue-0", "do");
    await store().setOverride("issue-249", "drop");
    expect(await store().overrides(ids)).toEqual(
      new Map([
        ["issue-0", "do"],
        ["issue-249", "drop"],
      ]),
    );
  });
});
