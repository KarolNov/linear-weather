// Where a team's open boards hear that it changed. Webhooks and subscriptions land in whichever
// Worker isolate Cloudflare picks, which share no memory, so they meet in a Durable Object: one
// per Linear team, named by its id. Each board's subscription holds a WebSocket to it, and a
// change sends a message down every one. The messages carry nothing but "changed": each board
// reads the team again with its own viewer's Linear session, so nobody sees what they couldn't.

import { DurableObject } from "cloudflare:workers";

/** A team's changes, as a board's subscription listens for them and a change announces them. */
export interface TeamChanges {
  /**
   * Calls `changed` each time the team changes, until the returned function stops it. `lost`
   * means it stopped hearing (the channel restarted, say), so the listener should start over.
   */
  listen(teamId: string, handlers: { changed(): void; lost(): void }): Promise<() => void>;
  /** Tells every board listening on the team that it changed. */
  publish(teamId: string): Promise<void>;
}

/** A team's channel. Its WebSockets hibernate, so a quiet team costs nothing. */
export class TeamChannel extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /** Tells every board listening that the team changed; how many there were. */
  async publish(): Promise<number> {
    const sockets = this.ctx.getWebSockets();
    for (const socket of sockets) {
      try {
        socket.send("changed");
      } catch {
        // Closing as we speak; its subscription has gone.
      }
    }
    return sockets.length;
  }

  // Listeners only listen. Without this handler, a message from one would be an error.
  override async webSocketMessage(): Promise<void> {}
}

/** Each team's channel, in the TEAM_CHANNELS namespace. */
export function teamChannels(namespace: DurableObjectNamespace<TeamChannel>): TeamChanges {
  const channel = (teamId: string) => namespace.get(namespace.idFromName(teamId));
  return {
    async listen(teamId, { changed, lost }) {
      const response = await channel(teamId).fetch("https://team-channel/", {
        headers: { upgrade: "websocket" },
      });
      const socket = response.webSocket;
      if (!socket) throw new Error(`The team's channel answered ${response.status}`);
      socket.accept();
      // Listening ends once, whichever comes first: the listener stops, or the socket errors or
      // closes (an error is followed by a close, which mustn't tell the listener twice).
      let listening = true;
      socket.addEventListener("message", () => {
        if (listening) changed();
      });
      const end = () => {
        if (!listening) return;
        listening = false;
        lost();
      };
      socket.addEventListener("close", end);
      socket.addEventListener("error", end);
      return () => {
        if (!listening) return;
        listening = false;
        try {
          socket.close(1000, "Done listening");
        } catch {
          // Already closing; nothing left to stop.
        }
      };
    },
    async publish(teamId) {
      await channel(teamId).publish();
    },
  };
}
