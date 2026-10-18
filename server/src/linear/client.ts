import type { LinearAuthorization } from "../session";
import type { TypedDocumentString } from "./generated/graphql";

const LINEAR_API = "https://api.linear.app/graphql";

// Linear's rate limiter is a leaky bucket that refills continuously, so a short wait frees up
// some budget. Back off briefly (0.25s, 0.5s, 1s) when it says we're over; after that it's the
// caller's problem, since a Worker request shouldn't hang for minutes.
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 250;

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

export class LinearClient {
  /** Updated after every request; null until the first one. */
  rateLimit: RateLimit | null = null;
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
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.send<TResult>(document.toString(), variables);
      } catch (error) {
        if (!(error instanceof LinearRateLimitError) || attempt >= MAX_RETRIES) throw error;
        await this.sleep(BASE_BACKOFF_MS * 2 ** attempt);
      }
    }
  }

  private async send<T>(query: string, variables: unknown): Promise<T> {
    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: this.authorization },
      body: JSON.stringify({ query, variables }),
    });
    this.rateLimit = readRateLimit(res.headers);
    if (res.status === 401) throw new LinearAuthError("Linear rejected the access token");

    const body = (await res.json()) as { data?: T; errors?: LinearError[] };
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
