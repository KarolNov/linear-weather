import type { LinearAuthorization } from "./session";

// Minimal Linear GraphQL client. #4 replaces this with typed, paginated queries.

const LINEAR_API = "https://api.linear.app/graphql";

/** Linear rejected our credentials: the token was revoked or the API key deleted. */
export class LinearAuthError extends Error {}

export class LinearClient {
  constructor(private readonly authorization: LinearAuthorization) {}

  async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: this.authorization },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 401) throw new LinearAuthError("Linear rejected the access token");

    const body = (await res.json()) as { data?: T; errors?: LinearError[] };
    // Linear usually reports bad credentials as a GraphQL error, not a 401.
    if (body.errors?.some((e) => e.extensions?.code === "AUTHENTICATION_ERROR")) {
      throw new LinearAuthError("Linear rejected the access token");
    }
    if (body.errors?.length || !body.data) {
      throw new Error(`Linear API error: ${body.errors?.map((e) => e.message).join("; ")}`);
    }
    return body.data;
  }
}

interface LinearError {
  message: string;
  extensions?: { code?: string };
}
