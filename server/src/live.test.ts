import { describe, expect, it } from "vitest";
import { msUntilNextUtcDay, teamUpdates, type UpdateTiming } from "./live";
import type { TeamChanges } from "./team-channel";

/** A team's changes made by hand: `change()` is a webhook arriving, `lose()` the channel going. */
function fakeChanges() {
  let handlers: { changed(): void; lost(): void } | null = null;
  const listening: string[] = [];
  let stopped = 0;
  const changes: TeamChanges = {
    async listen(teamId, given) {
      listening.push(teamId);
      handlers = given;
      return () => {
        stopped++;
      };
    },
    publish: async () => {},
  };
  return {
    changes,
    listening,
    stopped: () => stopped,
    change: () => handlers?.changed(),
    lose: () => handlers?.lost(),
  };
}

const quick: UpdateTiming = { settleMs: 20, msUntilNextDay: () => 60_000 };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Whether the iterator yields within `ms`. */
async function yieldsWithin(next: Promise<IteratorResult<unknown>>, ms: number) {
  return Promise.race([next.then(() => true), sleep(ms).then(() => false)]);
}

describe("teamUpdates", () => {
  it("yields once for changes close together", async () => {
    const fake = fakeChanges();
    const updates = teamUpdates("team-1", fake.changes, quick);
    const first = updates.next();
    await sleep(0);
    expect(fake.listening).toEqual(["team-1"]);
    fake.change();
    fake.change();
    fake.change();
    expect(await first).toEqual({ done: false, value: true });
    // All three came in one update.
    expect(await yieldsWithin(updates.next(), 60)).toBe(false);
    await updates.return(undefined);
  });

  it("yields once as it starts listening, for changes made before it could hear", async () => {
    const fake = fakeChanges();
    const updates = teamUpdates("team-1", fake.changes, quick);
    expect(await yieldsWithin(updates.next(), 200)).toBe(true);
    expect(await yieldsWithin(updates.next(), 60)).toBe(false);
    await updates.return(undefined);
  });

  it("keeps one update waiting while the last is still being read", async () => {
    const fake = fakeChanges();
    const updates = teamUpdates("team-1", fake.changes, quick);
    const first = updates.next();
    await sleep(0);
    fake.change();
    await first;
    // The board is being read for that one; two more changes settle meanwhile.
    fake.change();
    await sleep(40);
    fake.change();
    await sleep(40);
    // They make one update waiting, not two.
    expect(await updates.next()).toEqual({ done: false, value: true });
    expect(await yieldsWithin(updates.next(), 60)).toBe(false);
    await updates.return(undefined);
  });

  it("yields as each new day begins, with no changes", async () => {
    let days = 0;
    const updates = teamUpdates(
      "team-1",
      undefined,
      // Each "day" is 15ms long.
      {
        settleMs: 20,
        msUntilNextDay: () => {
          days++;
          return 15;
        },
      },
    );
    expect(await yieldsWithin(updates.next(), 200)).toBe(true);
    expect(await yieldsWithin(updates.next(), 200)).toBe(true);
    expect(days).toBeGreaterThanOrEqual(2);
    await updates.return(undefined);
  });

  it("stops listening once it's returned, even while waiting", async () => {
    const fake = fakeChanges();
    const updates = teamUpdates("team-1", fake.changes, quick);
    const waiting = updates.next();
    await sleep(0);
    await updates.return(undefined);
    expect(await waiting).toEqual({ done: true, value: undefined });
    expect(fake.stopped()).toBe(1);
  });

  it("ends when it stops hearing the team, so the client starts over", async () => {
    const fake = fakeChanges();
    const updates = teamUpdates("team-1", fake.changes, quick);
    const waiting = updates.next();
    await sleep(0);
    fake.lose();
    expect(await waiting).toEqual({ done: true, value: undefined });
  });

  it("fails when it can't listen at all", async () => {
    const updates = teamUpdates(
      "team-1",
      {
        listen: () => Promise.reject(new Error("no channel")),
        publish: async () => {},
      },
      quick,
    );
    await expect(updates.next()).rejects.toThrow("no channel");
  });
});

describe("msUntilNextUtcDay", () => {
  it("counts to a second past the next UTC midnight", () => {
    expect(msUntilNextUtcDay(Date.parse("2026-11-18T23:59:00Z"))).toBe(61_000);
    expect(msUntilNextUtcDay(Date.parse("2026-11-18T00:00:00Z"))).toBe(24 * 3_600_000 + 1_000);
  });
});
