import { GraphQLError } from "graphql";
import { createLogger, createYoga, maskError, type YogaLogger } from "graphql-yoga";
import { Hono } from "hono";
import { auth } from "./auth";
import { Store } from "./db/store";
import {
  LinearAuthError,
  LinearClient,
  LinearRateLimitError,
  type LinearSource,
} from "./linear/client";
import { DemoLinear } from "./linear/demo";
import { Placements } from "./placements";
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
  logging: quietAboutLinear(createLogger()),
});

export const app = new Hono<{ Bindings: Env }>()
  .get("/health", (c) => c.json({ ok: true }))
  .route("/auth", auth)
  .on(["GET", "POST"], "/graphql", (c) => {
    // A cross-site form can POST urlencoded or multipart bodies without a CORS preflight, which
    // Yoga would run as a mutation. The session cookie is SameSite, but a dev API key needs no
    // cookie at all, so only take what a form can't send.
    if (c.req.method === "POST" && !isGraphQLBody(c.req.header("content-type"))) {
      return c.text("Send GraphQL as application/json", 415);
    }
    // Resolved on first use, so queries that don't touch Linear skip the session lookup.
    let workspace: Promise<Workspace | null> | undefined;
    return yoga.fetch(c.req.raw, {
      demo: isDemo(c),
      workspace: () =>
        (workspace ??= linearSource(c).then((linear) => linear && new Workspace(linear))),
      placements: new Placements(new Store(c.env.DB)),
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
 * Yoga logs every error it masks or rewrites. A spent rate limit or a revoked token is expected
 * and reaches the client with a code, so only log what's actually unexpected.
 */
function quietAboutLinear(logger: YogaLogger): YogaLogger {
  return {
    ...logger,
    error: (...args: unknown[]) => {
      const [error] = args;
      const cause = error instanceof GraphQLError ? error.originalError : error;
      if (cause instanceof LinearRateLimitError || cause instanceof LinearAuthError) return;
      logger.error(...args);
    },
  };
}

function isGraphQLBody(contentType: string | undefined): boolean {
  const type = contentType?.split(";")[0]?.trim().toLowerCase();
  return type === "application/json" || type === "application/graphql+json";
}

function isDemo(c: AppContext): boolean {
  return c.req.query("demo") === "true";
}

/**
 * Linear as the signed-in user sees it, or the mocked Avengers workspace for `?demo=true`, so
 * anyone can try the board without a Linear account.
 */
async function linearSource(c: AppContext): Promise<LinearSource | null> {
  if (isDemo(c)) return new DemoLinear();
  const authorization = await linearAuthorization(c);
  if (!authorization) return null;
  const client = new LinearClient(authorization);
  // Concurrent requests fail together on a revoked token; forget the session once.
  let discarded: Promise<unknown> | undefined;
  return {
    // A revoked token means signed out: forget it, so the next page shows the sign-in.
    request: (document, ...variables) =>
      client.request(document, ...variables).catch(async (error: unknown) => {
        if (error instanceof LinearAuthError) {
          discarded ??= discardSession(c);
          await discarded;
        }
        throw error;
      }),
  };
}

export default app;
