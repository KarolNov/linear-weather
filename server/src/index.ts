import { createYoga } from "graphql-yoga";
import { Hono } from "hono";
import { auth } from "./auth";
import { LinearClient, type LinearSource } from "./linear/client";
import { DemoLinear } from "./linear/demo";
import { type GraphQLContext, schema } from "./schema";
import { type AppContext, discardSession, linearAuthorization } from "./session";

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
    let linear: Promise<LinearSource | null> | undefined;
    return yoga.fetch(c.req.raw, {
      linear: () => (linear ??= linearSource(c)),
      discardSession: async () => {
        await discardSession(c);
      },
    });
  });

/**
 * Linear as the signed-in user sees it, or the mocked Avengers workspace for `?demo=true`, so
 * anyone can try the board without a Linear account.
 */
async function linearSource(c: AppContext): Promise<LinearSource | null> {
  if (c.req.query("demo") === "true") return new DemoLinear();
  const authorization = await linearAuthorization(c);
  return authorization ? new LinearClient(authorization) : null;
}

export default app;
