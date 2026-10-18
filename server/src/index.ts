import { createYoga } from "graphql-yoga";
import { Hono } from "hono";
import { auth } from "./auth";
import { LinearClient } from "./linear";
import { type GraphQLContext, schema } from "./schema";
import { linearAuthorization } from "./session";

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
  .on(["GET", "POST"], "/graphql", async (c) => {
    const authorization = await linearAuthorization(c);
    const linear = authorization ? new LinearClient(authorization) : null;
    return yoga.fetch(c.req.raw, { linear });
  });

export default app;
