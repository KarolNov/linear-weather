import { type Context, Hono } from "hono";
import { html, raw } from "hono/html";
import { renderToString } from "preact-render-to-string";
import { App, type AppProps } from "./App";
import type { BoardResponse } from "./board";

export interface Bindings {
  /** Service binding to the server Worker (see wrangler.jsonc). */
  SERVER: { fetch(request: Request): Promise<Response> };
}

// In dev Vite serves the source module and the StyleX plugin the styles collected so far; the
// production client bundle and stylesheet have fixed names (see vite.config.ts).
const clientScript = import.meta.env.DEV ? "/src/client.tsx" : "/assets/client.js";
const stylesheet = import.meta.env.DEV ? "/virtual:stylex.css" : "/assets/stylex.css";

// Element defaults StyleX can't express, inlined because they're tiny.
const globalCss = `*,*::before,*::after{box-sizing:border-box}
html{color-scheme:light;-webkit-text-size-adjust:100%}
body{margin:0}
h1,h2,h3,p{margin:0}`;

// Browser chrome and overscroll match the page's sky: the sunset sign-in page or the dawn board.
const skyColors = {
  sunset: { theme: "#46246b", body: "#1f1747" },
  dawn: { theme: "#cfe2ff", body: "#cfe2ff" },
};

const toServer = (c: Context<{ Bindings: Bindings }>) => c.env.SERVER.fetch(c.req.raw);

export const app = new Hono<{ Bindings: Bindings }>()
  .all("/auth/*", toServer)
  .all("/graphql", toServer)
  // Only known pages render; anything else 404s without asking Linear who is signed in.
  .get("/", async (c) => {
    const demo = c.req.query("demo") === "true";
    const loaded = await fetchBoard(c, demo, c.req.query("team"));
    const signedIn = loaded !== null && loaded !== UNAVAILABLE;
    const props: AppProps = {
      viewer: signedIn ? loaded.viewer : null,
      linearUnavailable: loaded === UNAVAILABLE || undefined,
      authError: c.req.query("auth_error"),
      demo: demo || undefined,
      ...(signedIn &&
        ("board" in loaded
          ? { board: loaded.board }
          : { board: null, boardError: loaded.boardError })),
    };
    // Escape "<" so the JSON can't close the <script> tag early.
    const propsJson = JSON.stringify(props).replaceAll("<", "\\u003c");
    const sky = props.viewer ? skyColors.dawn : skyColors.sunset;

    return c.html(html`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta name="theme-color" content="${sky.theme}" />
          <title>Weather Forecast for Linear</title>
          <style>${raw(`${globalCss}\nbody{background:${sky.body}}`)}</style>
          <link rel="stylesheet" href="${stylesheet}" />
          ${import.meta.env.DEV ? html`<script type="module" src="/@vite/client"></script>` : ""}
          <script type="module" src="${clientScript}"></script>
        </head>
        <body>
          <div id="app">${raw(renderToString(<App {...props} />))}</div>
          <script id="app-props" type="application/json">${raw(propsJson)}</script>
        </body>
      </html>`);
  });

const UNAVAILABLE = Symbol("unavailable");

/**
 * Who is signed in and their board for `teamId` (or their team), from the server's temporary
 * `/board` route, forwarding the browser's session cookie; or the mocked Avengers workspace
 * when `demo` is set. Null means signed out; UNAVAILABLE means we couldn't tell (server or
 * Linear failed).
 */
async function fetchBoard(
  c: Context<{ Bindings: Bindings }>,
  demo: boolean,
  teamId: string | undefined,
): Promise<BoardResponse | null | typeof UNAVAILABLE> {
  try {
    const url = new URL("/board", c.req.url);
    if (demo) url.searchParams.set("demo", "true");
    if (teamId) url.searchParams.set("team", teamId);
    const res = await c.env.SERVER.fetch(
      new Request(url, { headers: { cookie: c.req.header("cookie") ?? "" } }),
    );
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`server responded ${res.status}`);
    return (await res.json()) as BoardResponse;
  } catch (error) {
    console.error(`Couldn't load the board: ${error}`);
    return UNAVAILABLE;
  }
}

export default app;
