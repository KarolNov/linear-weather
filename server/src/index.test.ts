import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "./index";

describe("server worker", () => {
  it("reports health", async () => {
    const res = await exports.default.fetch("http://localhost/health");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("answers a GraphQL query", async () => {
    const res = await exports.default.fetch("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ hello }" }),
    });
    expect(await res.json()).toEqual({ data: { hello: "☀️" } });
  });
});

describe("POST /graphql", () => {
  const query = (url: string, source: string, bindings: Env = env) =>
    app.request(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: source }),
      },
      bindings,
    );

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("answers from the demo workspace on ?demo=true", async () => {
    const res = await query(
      "http://localhost/graphql?demo=true",
      '{ viewer { name } team(id: "demo-team-ops") { name people { name } } }',
    );
    const { data } = (await res.json()) as {
      data: { viewer: { name: string }; team: { name: string; people: unknown[] } };
    };
    expect(data.viewer.name).toBe("Nick Fury");
    expect(data.team.name).toBe("S.H.I.E.L.D. Ops");
    expect(data.team.people.length).toBeGreaterThan(0);
  });

  it.each(["application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "text/plain"])(
    "refuses %s bodies, which a cross-site form can send",
    async (contentType) => {
      const res = await app.request(
        "http://localhost/graphql",
        {
          method: "POST",
          headers: { "content-type": contentType },
          body: "query=mutation%20%7B%20clearOverride(issueId%3A%20%22x%22)%20%7B%20__typename%20%7D%20%7D",
        },
        env,
      );
      expect(res.status).toBe(415);
    },
  );

  it("keeps the demo read-only, since anyone can open it", async () => {
    const res = await query(
      "http://localhost/graphql?demo=true",
      'mutation { overrideQuadrant(issueId: "demo-issue-avg-1", quadrant: DROP) { __typename } }',
    );
    expect(await res.json()).toEqual({
      data: { overrideQuadrant: { __typename: "Unauthorized" } },
    });
  });

  it("says when Linear's rate limit is spent, and when to retry, keeping the rest", async () => {
    const resetAt = Date.now() + 60_000;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const { query } = (await new Request(input, init).json()) as { query: string };
      if (query.includes("viewer {\n    id")) {
        return Response.json({
          data: {
            viewer: {
              id: "u",
              name: "Ada",
              avatarUrl: null,
              organization: { name: "Acme", urlKey: "acme" },
            },
          },
        });
      }
      return Response.json(
        { errors: [{ message: "Rate limit exceeded", extensions: { code: "RATELIMITED" } }] },
        { status: 400, headers: { "x-ratelimit-requests-reset": String(resetAt) } },
      );
    });
    const res = await query("http://localhost/graphql", "{ viewer { name } teams { name } }", {
      ...env,
      LINEAR_API_KEY: "lin_api_dev",
    });
    const body = (await res.json()) as {
      data: unknown;
      errors: { path: string[]; extensions: unknown }[];
    };
    expect(body.data).toEqual({ viewer: { name: "Ada" }, teams: null });
    expect(body.errors).toMatchObject([
      { path: ["teams"], extensions: { code: "RATE_LIMITED", resetAt } },
    ]);
  });
});
