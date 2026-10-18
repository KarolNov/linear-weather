import { createYoga } from "graphql-yoga";
import { Hono } from "hono";
import { auth } from "./auth";
import { LinearClient } from "./linear/client";
import { type GraphQLContext, schema } from "./schema";
import { discardSession, linearAuthorization } from "./session";

const yoga = createYoga<GraphQLContext>({
  schema,
  graphqlEndpoint: "/graphql",
  // Use the runtime's own Request/Response. Under the Vite dev server Yoga otherwise resolves
  // its Node polyfill, whose Response can't cross the web Worker's service binding.
  fetchAPI: globalThis,
});

export const app = new Hono<{ Bindings: Env }>()
  .get("/health", (c) => c.json({ ok: true }))
  .route("/auth", auth)
  .on(["GET", "POST"], "/graphql", (c) => {
    // Resolved on first use, so queries that don't touch Linear skip the session lookup.
    let linear: Promise<LinearClient | null> | undefined;
    return yoga.fetch(c.req.raw, {
      linear: () =>
        (linear ??= linearAuthorization(c).then((a) => (a ? new LinearClient(a) : null))),
      discardSession: async () => {
        await discardSession(c);
      },
    });
  });

export default app;
