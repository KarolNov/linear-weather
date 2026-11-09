import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LinearAuthError,
  LinearClient,
  LinearForbiddenError,
  LinearInvalidInputError,
  LinearRateLimitError,
} from "./client";
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

  it("waits for the budget to refill enough for a query it has seen cost more", async () => {
    const short = () =>
      Response.json(
        { data: { viewer: { id: "u1" } } },
        {
          headers: {
            ...RATE_HEADERS,
            "x-complexity": "1000",
            "x-ratelimit-complexity-remaining": "500",
          },
        },
      );
    const fetchMock = mockFetch(short, ok);
    const sleep = vi.fn(async () => {});
    const client = new LinearClient("Bearer token", { sleep });

    await client.request(Hello);
    await client.request(Hello);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 500 points short at 2,000,000 an hour.
    expect(sleep.mock.calls).toEqual([[900]]);
  });

  it("remembers costs per page size, since Linear scales a query's cost by it", async () => {
    const Paged = new TypedDocumentString<{ viewer: { id: string } }, { first: number }>(
      "query Paged($first: Int!) { viewer { id } }",
    );
    const big = () =>
      Response.json(
        { data: { viewer: { id: "u1" } } },
        {
          headers: {
            ...RATE_HEADERS,
            "x-complexity": "1000",
            "x-ratelimit-complexity-remaining": "500",
          },
        },
      );
    mockFetch(big, ok, ok);
    const sleep = vi.fn(async () => {});
    const client = new LinearClient("Bearer token", { sleep });

    await client.request(Paged, { first: 10 });
    // A smaller page hasn't been seen to cost that much, so it goes out at once.
    await client.request(Paged, { first: 1 });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("waits for a request when the request budget is spent", async () => {
    const spent = () =>
      Response.json(
        { data: { viewer: { id: "u1" } } },
        { headers: { ...RATE_HEADERS, "x-ratelimit-requests-remaining": "0" } },
      );
    mockFetch(spent, ok);
    const sleep = vi.fn(async () => {});
    const client = new LinearClient("Bearer token", { sleep });

    await client.request(Hello);
    await client.request(Hello);

    // One request at 5,000 an hour.
    expect(sleep.mock.calls).toEqual([[720]]);
  });

  it("gives up without sending when the budget is far from covering the query", async () => {
    const fetchMock = mockFetch(() =>
      Response.json(
        { data: { viewer: { id: "u1" } } },
        {
          headers: {
            ...RATE_HEADERS,
            "x-complexity": "9000",
            "x-ratelimit-complexity-remaining": "0",
          },
        },
      ),
    );
    const client = new LinearClient("Bearer token", { sleep: async () => {} });
    await client.request(Hello);

    const error = await client.request(Hello).catch((e) => e);
    expect(error).toBeInstanceOf(LinearRateLimitError);
    expect(error.resetAt).toBe(RESET);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it("reports a change the token isn't allowed to make as forbidden", async () => {
    mockFetch(() =>
      Response.json(
        {
          errors: [
            {
              message: "Invalid scope: `write` required",
              extensions: { type: "forbidden", code: "FORBIDDEN", statusCode: 403 },
            },
          ],
        },
        { status: 400 },
      ),
    );
    const client = new LinearClient("Bearer read-only");
    await expect(client.request(Hello)).rejects.toBeInstanceOf(LinearForbiddenError);
  });

  it("reports input Linear can't take, like an id that isn't one, as invalid input", async () => {
    mockFetch(() =>
      Response.json(
        {
          errors: [
            {
              message: "Argument Validation Error",
              extensions: { type: "invalid input", code: "INPUT_ERROR", userError: true },
            },
          ],
        },
        { status: 400 },
      ),
    );
    const client = new LinearClient("Bearer token");
    await expect(client.request(Hello)).rejects.toBeInstanceOf(LinearInvalidInputError);
  });

  it("surfaces other GraphQL errors", async () => {
    mockFetch(() => Response.json({ errors: [{ message: "Entity not found" }] }));
    const client = new LinearClient("Bearer token");
    await expect(client.request(Hello)).rejects.toThrow("Linear API error: Entity not found");
  });

  it("reports a non-JSON response by its status", async () => {
    mockFetch(() => new Response("<html>Service Unavailable</html>", { status: 503 }));
    const client = new LinearClient("Bearer token");
    await expect(client.request(Hello)).rejects.toThrow("Linear API error: HTTP 503");
  });
});
