import type { LinearAuthorization } from "../session";
import type { TypedDocumentString } from "./generated";

const LINEAR_API = "https://api.linear.app/graphql";

// Linear's rate limiter is a leaky bucket that refills continuously (5,000 requests and 2,000,000
// complexity points an hour), so a short wait frees up some budget. Before a request, wait for
// the last-known budget to cover what the query cost last time; when Linear still says we're
// over, back off (at least 0.25s, 0.5s, 1s). A wait longer than a few seconds is the caller's
// problem, since a Worker request shouldn't hang for minutes.
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 250;
const MAX_WAIT_MS = 5_000;
const REQUESTS_PER_MS = 5_000 / 3_600_000;
const COMPLEXITY_PER_MS = 2_000_000 / 3_600_000;

/** Linear rejected our credentials: the token was revoked or the API key deleted. */
export class LinearAuthError extends Error {}

/** Linear's rate limit is spent, or about to be. Retry after `resetAt` (epoch ms), if known. */
export class LinearRateLimitError extends Error {
  constructor(readonly resetAt: number | null) {
    super("Linear's API rate limit is exhausted");
  }
}

/** Linear's view of our budget, read from the response headers of the last request. */
export interface RateLimit {
  /** What the last query cost, in complexity points. */
  complexity: number | null;
  requestsRemaining: number | null;
  complexityRemaining: number | null;
  /** When the budget is fully refilled, in epoch ms. */
  resetAt: number | null;
}

export interface LinearClientOptions {
  /** Waits between retries. Tests swap it out to skip real time. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Where Linear data comes from: send one of our typed queries, get its result. `LinearClient`
 * asks Linear's API; `DemoLinear` answers from a mocked workspace. Code that reads Linear takes
 * this, so it can't tell the two apart.
 */
export interface LinearSource {
  request<TResult, TVariables>(
    document: TypedDocumentString<TResult, TVariables>,
    // Operations without variables can omit them.
    ...[variables]: TVariables extends Record<string, never> ? [] : [TVariables]
  ): Promise<TResult>;
}

export class LinearClient implements LinearSource {
  /** Updated after every request; null until the first one. */
  rateLimit: RateLimit | null = null;
  /** What each query string cost last time, so concurrent queries don't read each other's. */
  private readonly costs = new Map<string, number>();
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly authorization: LinearAuthorization,
    options: LinearClientOptions = {},
  ) {
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async request<TResult, TVariables>(
    document: TypedDocumentString<TResult, TVariables>,
    // Operations without variables can omit them.
    ...[variables]: TVariables extends Record<string, never> ? [] : [TVariables]
  ): Promise<TResult> {
    const query = document.toString();
    for (let attempt = 0; ; attempt++) {
      await this.waitForBudget(query, attempt === 0 ? 0 : BASE_BACKOFF_MS * 2 ** (attempt - 1));
      try {
        return await this.send<TResult>(query, variables);
      } catch (error) {
        if (!(error instanceof LinearRateLimitError) || attempt >= MAX_RETRIES) throw error;
      }
    }
  }

  /**
   * Waits at least `minMs`, and until the budget has refilled enough for one more request
   * costing what `query` cost last time. Throws instead if that would take too long.
   */
  private async waitForBudget(query: string, minMs: number): Promise<void> {
    const { requestsRemaining, complexityRemaining, resetAt } = this.rateLimit ?? {};
    const cost = this.costs.get(query) ?? 0;
    const refill = Math.max(
      requestsRemaining == null ? 0 : (1 - requestsRemaining) / REQUESTS_PER_MS,
      complexityRemaining == null ? 0 : (cost - complexityRemaining) / COMPLEXITY_PER_MS,
    );
    if (refill > MAX_WAIT_MS) throw new LinearRateLimitError(resetAt ?? null);
    const wait = Math.ceil(Math.max(minMs, refill));
    if (wait > 0) await this.sleep(wait);
  }

  private async send<T>(query: string, variables: unknown): Promise<T> {
    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: this.authorization },
      body: JSON.stringify({ query, variables }),
    });
    this.rateLimit = readRateLimit(res.headers);
    if (this.rateLimit.complexity !== null) this.costs.set(query, this.rateLimit.complexity);
    if (res.status === 401) throw new LinearAuthError("Linear rejected the access token");

    // Outages can come back as HTML error pages.
    const body = (await res.json().catch(() => null)) as {
      data?: T;
      errors?: LinearError[];
    } | null;
    if (!body) throw new Error(`Linear API error: HTTP ${res.status} with no JSON body`);
    const codes = new Set(body.errors?.map((e) => e.extensions?.code));
    // Linear usually reports bad credentials as a GraphQL error, not a 401.
    if (codes.has("AUTHENTICATION_ERROR")) {
      throw new LinearAuthError("Linear rejected the access token");
    }
    // Rate limiting comes back as HTTP 400 with this code.
    if (codes.has("RATELIMITED")) throw new LinearRateLimitError(this.rateLimit.resetAt);
    if (body.errors?.length || !body.data) {
      throw new Error(`Linear API error: ${body.errors?.map((e) => e.message).join("; ")}`);
    }
    return body.data;
  }
}

function readRateLimit(headers: Headers): RateLimit {
  const num = (name: string) => {
    const value = headers.get(name);
    return value === null || value === "" || Number.isNaN(Number(value)) ? null : Number(value);
  };
  // Whichever budget refills last decides when we're fully back.
  const resets = [num("x-ratelimit-requests-reset"), num("x-ratelimit-complexity-reset")];
  const known = resets.filter((r) => r !== null);
  return {
    complexity: num("x-complexity"),
    requestsRemaining: num("x-ratelimit-requests-remaining"),
    complexityRemaining: num("x-ratelimit-complexity-remaining"),
    resetAt: known.length ? Math.max(...known) : null,
  };
}

interface LinearError {
  message: string;
  extensions?: { code?: string };
}
