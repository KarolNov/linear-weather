import { Hono } from "hono";
import { html, raw } from "hono/html";
import { renderToString } from "preact-render-to-string";
import { App } from "./App";

// In dev Vite serves the source module; the production client bundle has a fixed name
// (see vite.config.ts).
const clientScript = import.meta.env.DEV ? "/src/client.tsx" : "/assets/client.js";

export const app = new Hono().get("*", (c) =>
  c.html(html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Linear Weather</title>
        ${import.meta.env.DEV ? html`<script type="module" src="/@vite/client"></script>` : ""}
        <script type="module" src="${clientScript}"></script>
      </head>
      <body>
        <div id="app">${raw(renderToString(<App />))}</div>
      </body>
    </html>`),
);

export default app;
