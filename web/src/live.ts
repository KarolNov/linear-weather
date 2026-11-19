// Keeping an open board current: the server's `teamWeatherUpdated` subscription, over
// server-sent events. It sends the team's whole board whenever it may read differently (a change
// in Linear or on another board, or a new day), so the page redraws from it as from a mutation's
// answer.

import type { CalendarDate, GraphQLResponse, TeamBoardData } from "./board";
import { documentId } from "./document-id";
import { TeamWeatherDocument, type TeamWeatherSubscription } from "./generated";

/** The team's board as it reads now, and the day it was read on. */
export interface TeamUpdate {
  today: CalendarDate;
  team: TeamBoardData;
}

export interface UpdateHandlers {
  update(update: TeamUpdate): void;
  /**
   * The connection came back after a break, during which updates may have been missed: read
   * the board again.
   */
  resumed(): void;
}

/** The part of the browser's EventSource listening uses, so tests can stand in for it. */
export interface EventSourceLike {
  readonly readyState: number;
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

const CLOSED = 2;
/** The first wait before connecting again after the server ended the stream; it doubles from there. */
export const FIRST_RETRY_MS = 5_000;
export const MAX_RETRY_MS = 5 * 60_000;

/**
 * Listens for updates to a team's board until the returned function stops it. The browser
 * reconnects by itself after a network blip; when the server ends the stream (it stopped hearing
 * the team, or the Worker restarted), this connects again, waiting longer each time it fails.
 * Gives up for good when the server refuses outright: signed out, or a team they can't see.
 */
export function listenForUpdates(
  teamId: string,
  handlers: UpdateHandlers,
  open: (url: string) => EventSourceLike = (url) => new EventSource(url),
): () => void {
  const url = `/graphql?${new URLSearchParams({
    documentId: documentId(TeamWeatherDocument),
    variables: JSON.stringify({ teamId }),
  })}`;
  let source: EventSourceLike | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let retryMs = FIRST_RETRY_MS;
  let connectedBefore = false;
  let stopped = false;

  const stop = () => {
    stopped = true;
    clearTimeout(retry);
    source?.close();
  };
  const reconnectLater = () => {
    source?.close();
    if (stopped) return;
    retry = setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
  };
  function connect() {
    const current = open(url);
    source = current;
    current.addEventListener("open", () => {
      retryMs = FIRST_RETRY_MS;
      if (connectedBefore) handlers.resumed();
      connectedBefore = true;
    });
    current.addEventListener("next", (event) => {
      const { data, errors = [] } = JSON.parse(
        event.data,
      ) as GraphQLResponse<TeamWeatherSubscription>;
      // No data at all: the subscription itself was refused, and asking again won't change that.
      if (!data || errors.some((e) => e.extensions?.code === "UNAUTHENTICATED")) {
        stop();
        return;
      }
      // A null team failed to read this time (Linear's rate limit, say); the next one may not.
      const { today, team } = data.teamWeatherUpdated;
      if (team?.id === teamId) handlers.update({ today, team });
    });
    // The server ended the stream.
    current.addEventListener("complete", reconnectLater);
    // A failed connection the browser won't retry itself (it retries network blips).
    current.addEventListener("error", () => {
      if (current.readyState === CLOSED) reconnectLater();
    });
  }

  connect();
  return stop;
}
