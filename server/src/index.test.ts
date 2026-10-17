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
