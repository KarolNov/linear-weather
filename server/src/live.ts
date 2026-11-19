// When an open board should read its team again: the team changed (in Linear, or on another
// board), or a new day began. Days matter even with no edits, since due dates come a day closer
// and the forecast's weeks move along.

import { Repeater, SlidingBuffer } from "graphql-yoga";
import type { TeamChanges } from "./team-channel";

export interface UpdateTiming {
  /**
   * How long to wait after a change for more before reading the team again. One edit in Linear
   * can send several webhooks, and each read costs the viewer's Linear budget.
   */
  settleMs: number;
  /** How long until the next day starts, as `today` counts days (UTC). */
  msUntilNextDay(): number;
}

export const DEFAULT_TIMING: UpdateTiming = {
  settleMs: 1_000,
  msUntilNextDay: () => msUntilNextUtcDay(Date.now()),
};

/** A second past the next UTC midnight, so the clock has surely moved on to the new day. */
export function msUntilNextUtcDay(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) - now + 1_000;
}

/**
 * Yields each time a team's board should be read again, until it's returned. Changes close
 * together yield once, and so do changes that come while the last update is still being read.
 * Without `changes` only new days do. Once listening, it yields once (settled like a change) for
 * whatever changed before it could hear: since the board was read, or while the client
 * reconnected. Ends when it stops hearing the team's changes, so the client starts over rather
 * than miss them.
 */
export function teamUpdates(
  teamId: string,
  changes: TeamChanges | undefined,
  timing: UpdateTiming = DEFAULT_TIMING,
): Repeater<true> {
  return new Repeater<true>(async (push, stop) => {
    let settling: ReturnType<typeof setTimeout> | undefined;
    let nextDay: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(settling);
      settling = undefined;
      // Settles once the update is read; the buffer keeps one waiting meanwhile.
      push(true).catch(() => {});
    };
    const changed = () => {
      settling ??= setTimeout(update, timing.settleMs);
    };
    const waitForNextDay = () => {
      nextDay = setTimeout(() => {
        update();
        waitForNextDay();
      }, timing.msUntilNextDay());
    };
    waitForNextDay();

    let unlisten = () => {};
    try {
      if (changes) {
        unlisten = await changes.listen(teamId, { changed, lost: () => stop() });
        changed();
      }
    } catch (error) {
      stop(error);
    }
    await stop;
    unlisten();
    clearTimeout(settling);
    clearTimeout(nextDay);
  }, new SlidingBuffer(1));
}
