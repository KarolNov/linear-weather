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

  describe("in the demo", () => {
    const demo = "http://localhost/graphql?demo=true";
    const placed = `{ team(id: "demo-team-avengers") {
      rules { urgencyWindowDays }
      people { matrix { drop { id quadrantSource } } }
    } }`;
    const dropAvg1 = `mutation {
      overrideQuadrant(issueId: "demo-issue-avg-1", quadrant: DROP) {
        __typename
        ... on OverrideSuccess { issue { quadrant quadrantSource } }
      }
    }`;
    const widenWindow = `mutation {
      updateQuadrantRules(
        teamId: "demo-team-avengers"
        input: { importantFrom: 3, urgencyWindowDays: 30, noDueDate: NOT_URGENT }
      ) { __typename }
    }`;

    /** A visitor's browser: it keeps the cookies the server sets and sends them back. */
    function browser(bindings: Env = env) {
      let cookie = "";
      return async (source: string) => {
        const res = await app.request(
          demo,
          {
            method: "POST",
            headers: { "content-type": "application/json", cookie },
            body: JSON.stringify({ query: source }),
          },
          bindings,
        );
        const set = res.headers.get("set-cookie");
        if (set) cookie = set.split(";")[0] ?? "";
        return { res, body: (await res.json()) as { data: Record<string, unknown> } };
      };
    }

    /** What the board shows: the demo's rules, and which issues were dropped by hand. */
    function board(data: Record<string, unknown>) {
      const { team } = data as {
        team: {
          rules: { urgencyWindowDays: number };
          people: { matrix: { drop: { id: string; quadrantSource: string }[] } }[];
        };
      };
      const dropped = team.people.flatMap(({ matrix }) =>
        matrix.drop.filter((issue) => issue.quadrantSource === "OVERRIDE").map(({ id }) => id),
      );
      return { window: team.rules.urgencyWindowDays, dropped };
    }

    it("lets a visitor change the board, keeping it in their browser across reloads", async () => {
      const visit = browser();
      expect((await visit(dropAvg1)).body.data).toEqual({
        overrideQuadrant: {
          __typename: "OverrideSuccess",
          issue: { quadrant: "DROP", quadrantSource: "OVERRIDE" },
        },
      });
      expect((await visit(widenWindow)).body.data).toEqual({
        updateQuadrantRules: { __typename: "UpdateRulesSuccess" },
      });
      expect(board((await visit(placed)).body.data)).toEqual({
        window: 30,
        dropped: ["demo-issue-avg-1"],
      });
    });

    it("lets a visitor hand an issue to someone else, keeping it in their browser too", async () => {
      const handOver = `mutation {
        reassignIssue(issueId: "demo-issue-avg-10", userId: "demo-user-wanda") { __typename }
      }`;
      const holder = `{ team(id: "demo-team-avengers") {
        people { name matrix { do { id } } }
      } }`;
      const holderOf = (data: Record<string, unknown>) =>
        (
          data as { team: { people: { name: string; matrix: { do: { id: string }[] } }[] } }
        ).team.people.find((p) => p.matrix.do.some((issue) => issue.id === "demo-issue-avg-10"))
          ?.name;

      const visit = browser();
      expect((await visit(handOver)).body.data).toEqual({
        reassignIssue: { __typename: "ReassignSuccess" },
      });
      expect(holderOf((await visit(holder)).body.data)).toBe("Wanda Maximoff");
      // Nobody else's demo changes.
      expect(holderOf((await browser()(holder)).body.data)).toBe("Tony Stark");
    });

    it("keeps each visitor's changes from every other visitor", async () => {
      await browser()(dropAvg1);
      expect(board((await browser()(placed)).body.data)).toEqual({ window: 14, dropped: [] });
    });

    it("sets no cookie when nothing changed", async () => {
      const { res } = await browser()(placed);
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("never touches D1, queries or mutations", async () => {
      // Placements falls back to the defaults when D1 fails, so record use rather than throw.
      const used: string[] = [];
      const watched = new Proxy(env.DB, {
        get: (target, property) => {
          used.push(String(property));
          return Reflect.get(target, property);
        },
      });
      const visit = browser({ ...env, DB: watched });
      for (const source of [dropAvg1, widenWindow, placed]) {
        expect((await visit(source)).body).not.toHaveProperty("errors");
      }
      expect(board((await visit(placed)).body.data).dropped).toEqual(["demo-issue-avg-1"]);
      expect(used).toEqual([]);
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
