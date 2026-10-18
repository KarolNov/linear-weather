import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

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

describe("GET /board", () => {
  it("answers from the demo workspace on ?demo=true, with who is signed in", async () => {
    const res = await exports.default.fetch("http://localhost/board?demo=true&team=demo-team-ops");
    const body = (await res.json()) as {
      viewer: { name: string };
      board: { team: { name: string }; people: unknown[] };
    };
    expect(body.viewer.name).toBe("Nick Fury");
    expect(body.board.team.name).toBe("S.H.I.E.L.D. Ops");
    expect(body.board.people.length).toBeGreaterThan(0);
  });

  it("is 401 when nobody is signed in", async () => {
    const res = await exports.default.fetch("http://example.com/board");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "signed_out" });
  });
});
