import { createYoga } from "graphql-yoga";
import { Hono } from "hono";
import { schema } from "./schema";

const yoga = createYoga<Env>({ schema, graphqlEndpoint: "/graphql" });

const app = new Hono<{ Bindings: Env }>()
  .get("/health", (c) => c.json({ ok: true }))
  .on(["GET", "POST"], "/graphql", (c) => yoga.fetch(c.req.raw, c.env));

export default app;
