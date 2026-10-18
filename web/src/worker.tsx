import { type Context, Hono } from "hono";
import { html, raw } from "hono/html";
import { renderToString } from "preact-render-to-string";
import { App, type AppProps, type Viewer } from "./App";

export interface Bindings {
  /** Service binding to the server Worker (see wrangler.jsonc). */
  SERVER: { fetch(request: Request): Promise<Response> };
}

// In dev Vite serves the source module; the production client bundle has a fixed name
// (see vite.config.ts).
const clientScript = import.meta.env.DEV ? "/src/client.tsx" : "/assets/client.js";

const toServer = (c: Context<{ Bindings: Bindings }>) => c.env.SERVER.fetch(c.req.raw);

export const app = new Hono<{ Bindings: Bindings }>()
  .all("/auth/*", toServer)
  .all("/graphql", toServer)
  // Only known pages render; anything else 404s without asking Linear who is signed in.
  .get("/", async (c) => {
    const viewer = await fetchViewer(c);
    const props: AppProps = {
      viewer: viewer === UNAVAILABLE ? null : viewer,
      linearUnavailable: viewer === UNAVAILABLE || undefined,
      authError: c.req.query("auth_error"),
    };
    // Escape "<" so the JSON can't close the <script> tag early.
    const propsJson = JSON.stringify(props).replaceAll("<", "\\u003c");

    return c.html(html`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Linear Weather</title>
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
 * Asks our GraphQL server who is signed in, forwarding the browser's session cookie.
 * Null means signed out; UNAVAILABLE means we couldn't tell (server or Linear failed).
 */
async function fetchViewer(
  c: Context<{ Bindings: Bindings }>,
): Promise<Viewer | null | typeof UNAVAILABLE> {
  try {
    const res = await c.env.SERVER.fetch(
      new Request(new URL("/graphql", c.req.url), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: c.req.header("cookie") ?? "",
        },
        body: JSON.stringify({
          query: "{ viewer { name avatarUrl organization { name } } }",
        }),
      }),
    );
    if (!res.ok) throw new Error(`server responded ${res.status}`);
    const body = (await res.json()) as {
      data?: { viewer: Viewer | null };
      errors?: { message: string }[];
    };
    if (body.errors?.length || !body.data) {
      throw new Error(body.errors?.map((e) => e.message).join("; ") ?? "no data");
    }
    return body.data.viewer;
  } catch (error) {
    console.error(`Couldn't load the viewer: ${error}`);
    return UNAVAILABLE;
  }
}

export default app;
