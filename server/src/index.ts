import { createYoga } from "graphql-yoga";
import { Hono } from "hono";
import { auth } from "./auth";
import { loadBoard } from "./board";
import { DEFAULT_RULES } from "./domain/quadrant";
import {
  LinearAuthError,
  LinearClient,
  LinearRateLimitError,
  type LinearSource,
} from "./linear/client";
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
  })
  // Temporary, until the board moves to GraphQL (#8): the web Worker renders this JSON.
  .get("/board", async (c) => {
    const linear = await linearSource(c);
    if (!linear) return c.json({ error: "signed_out" }, 401);
    try {
      const board = await loadBoard(linear, {
        teamId: c.req.query("team"),
        // Rules are per team once they're stored (#10); until then everyone gets the defaults.
        rules: DEFAULT_RULES,
        // UTC, so near midnight a PM elsewhere may be a day off. Fine for a read-only board.
        today: new Date().toISOString().slice(0, 10),
      });
      return c.json(board);
    } catch (error) {
      if (error instanceof LinearAuthError) {
        await discardSession(c);
        return c.json({ error: "signed_out" }, 401);
      }
      if (error instanceof LinearRateLimitError) {
        return c.json({ error: "rate_limited", resetAt: error.resetAt }, 503);
      }
      throw error;
    }
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
