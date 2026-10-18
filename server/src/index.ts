import { GraphQLError } from "graphql";
import { createYoga, maskError } from "graphql-yoga";
import { Hono } from "hono";
import { auth } from "./auth";
import {
  LinearAuthError,
  LinearClient,
  LinearRateLimitError,
  type LinearSource,
} from "./linear/client";
import { DemoLinear } from "./linear/demo";
import { type GraphQLContext, schema } from "./schema";
import { type AppContext, discardSession, linearAuthorization } from "./session";
import { Workspace } from "./workspace";

const yoga = createYoga<GraphQLContext>({
  schema,
  graphqlEndpoint: "/graphql",
  // Use the runtime's own Request/Response. Under the Vite dev server Yoga otherwise resolves
  // its Node polyfill, whose Response can't cross the web Worker's service binding.
  fetchAPI: globalThis,
  maskedErrors: { maskError: explainLinearErrors },
});

export const app = new Hono<{ Bindings: Env }>()
  .get("/health", (c) => c.json({ ok: true }))
  .route("/auth", auth)
  .on(["GET", "POST"], "/graphql", (c) => {
    // Resolved on first use, so queries that don't touch Linear skip the session lookup.
    let workspace: Promise<Workspace | null> | undefined;
    return yoga.fetch(c.req.raw, {
      workspace: () =>
        (workspace ??= linearSource(c).then((linear) => linear && new Workspace(linear))),
      today: new Date().toISOString().slice(0, 10),
    });
  });

/**
 * Linear's errors that clients can act on, as GraphQL errors with a code: the rate limit, with
 * when to retry, and a rejected token. Anything else is masked as Yoga does by default.
 */
function explainLinearErrors(error: unknown, message: string, isDev?: boolean): Error {
  const cause = error instanceof GraphQLError ? error.originalError : error;
  // Keep where in the query it failed, so the client knows which fields are missing.
  const at = error instanceof GraphQLError ? { nodes: error.nodes, path: error.path } : {};
  if (cause instanceof LinearRateLimitError) {
    return new GraphQLError("Linear's rate limit is spent for now", {
      ...at,
      extensions: { code: "RATE_LIMITED", resetAt: cause.resetAt },
    });
  }
  if (cause instanceof LinearAuthError) {
    return new GraphQLError("Linear rejected the session; sign in again", {
      ...at,
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return maskError(error, message, isDev);
}

/**
 * Linear as the signed-in user sees it, or the mocked Avengers workspace for `?demo=true`, so
 * anyone can try the board without a Linear account.
 */
async function linearSource(c: AppContext): Promise<LinearSource | null> {
  if (c.req.query("demo") === "true") return new DemoLinear();
  const authorization = await linearAuthorization(c);
  if (!authorization) return null;
  const client = new LinearClient(authorization);
  return {
    // A revoked token means signed out: forget it, so the next page shows the sign-in.
    request: (document, ...variables) =>
      client.request(document, ...variables).catch(async (error: unknown) => {
        if (error instanceof LinearAuthError) await discardSession(c);
        throw error;
      }),
  };
}

export default app;
