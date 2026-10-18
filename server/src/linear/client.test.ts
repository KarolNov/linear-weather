import { afterEach, describe, expect, it, vi } from "vitest";
import { LinearAuthError, LinearClient, LinearRateLimitError } from "./client";
import { TypedDocumentString } from "./generated";

const Hello = new TypedDocumentString<{ viewer: { id: string } }, Record<string, never>>(
  "query Hello { viewer { id } }",
);

const RESET = 1_800_000_000_000;
const RATE_HEADERS = {
  "x-complexity": "12",
  "x-ratelimit-requests-remaining": "4999",
  "x-ratelimit-requests-reset": String(RESET - 1000),
  "x-ratelimit-complexity-remaining": "1999988",
  "x-ratelimit-complexity-reset": String(RESET),
};

const ok = () => Response.json({ data: { viewer: { id: "u1" } } }, { headers: RATE_HEADERS });
const rateLimited = () =>
  Response.json(
    { errors: [{ message: "Rate limit exceeded", extensions: { code: "RATELIMITED" } }] },
    { status: 400, headers: { ...RATE_HEADERS, "x-ratelimit-complexity-remaining": "0" } },
  );

function mockFetch(...responses: (() => Response)[]) {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  for (const response of responses) fetchMock.mockImplementationOnce(async () => response());
  return fetchMock;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LinearClient", () => {
  it("sends the typed document and returns its data", async () => {
    const fetchMock = mockFetch(ok);
    const client = new LinearClient("Bearer token");

    expect(await client.request(Hello)).toEqual({ viewer: { id: "u1" } });

    const request = new Request(...(fetchMock.mock.calls[0] as Parameters<typeof fetch>));
    expect(request.url).toBe("https://api.linear.app/graphql");
    expect(request.headers.get("authorization")).toBe("Bearer token");
    expect(((await request.json()) as { query: string }).query).toBe(
      "query Hello { viewer { id } }",
    );
  });

  it("reads Linear's rate-limit headers", async () => {
    mockFetch(ok);
    const client = new LinearClient("Bearer token");
    await client.request(Hello);

    expect(client.rateLimit).toEqual({
      complexity: 12,
      requestsRemaining: 4999,
      complexityRemaining: 1999988,
      resetAt: RESET,
    });
  });

  it("backs off and retries when rate limited", async () => {
    const fetchMock = mockFetch(rateLimited, rateLimited, ok);
    const sleep = vi.fn(async () => {});
    const client = new LinearClient("Bearer token", { sleep });

    expect(await client.request(Hello)).toEqual({ viewer: { id: "u1" } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[250], [500]]);
  });

  it("gives up after a few retries, saying when the budget resets", async () => {
    mockFetch(rateLimited, rateLimited, rateLimited, rateLimited);
    const client = new LinearClient("Bearer token", { sleep: async () => {} });

    const error = await client.request(Hello).catch((e) => e);
    expect(error).toBeInstanceOf(LinearRateLimitError);
    expect(error.resetAt).toBe(RESET);
  });

  it("reports rejected credentials as an auth error", async () => {
    mockFetch(() =>
      Response.json({
        errors: [
          { message: "Authentication required", extensions: { code: "AUTHENTICATION_ERROR" } },
        ],
      }),
    );
    const client = new LinearClient("Bearer revoked");
    await expect(client.request(Hello)).rejects.toBeInstanceOf(LinearAuthError);
  });

  it("surfaces other GraphQL errors", async () => {
    mockFetch(() => Response.json({ errors: [{ message: "Entity not found" }] }));
    const client = new LinearClient("Bearer token");
    await expect(client.request(Hello)).rejects.toThrow("Linear API error: Entity not found");
  });
});
