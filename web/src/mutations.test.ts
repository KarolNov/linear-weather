import { describe, expect, it, vi } from "vitest";
import { boardClient } from "./mutations";

const team = { id: "t-avg", name: "Avengers", key: "AVG" };
const rules = { importantFrom: 2, urgencyWindowDays: 7, noDueDate: "URGENT" } as const;

/** A fetch whose answers the test hands out, one call at a time. */
function controlledFetch() {
  const answers: ((response: Response) => void)[] = [];
  const fetch = vi.fn(
    (_url: string | URL | Request, _init?: RequestInit) =>
      new Promise<Response>((resolve) => answers.push(resolve)),
  );
  const answer = (response: Response) => answers.shift()?.(response);
  return { fetch, answer };
}

const sent = (call: unknown[] | undefined) =>
  JSON.parse(String((call?.[1] as RequestInit | undefined)?.body)) as {
    query: string;
    variables: Record<string, unknown>;
  };

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("board client", () => {
  it("sends the demo's mutations to /graphql?demo=true", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ data: { updateQuadrantRules: { __typename: "UpdateRulesSuccess", team } } }),
    );
    await boardClient(true, fetch).updateRules("t-avg", rules);
    await boardClient(false, fetch).updateRules("t-avg", rules);
    expect(fetch.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
      "/graphql?demo=true",
      "/graphql",
    ]);
  });

  it("sends one mutation at a time, each after the last has answered", async () => {
    const { fetch, answer } = controlledFetch();
    const client = boardClient(true, fetch);
    const first = client.placeIssue("i-1", "drop");
    const second = client.placeIssue("i-2", null);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sent(fetch.mock.calls[0])).toMatchObject({
      variables: { issueId: "i-1", quadrant: "DROP" },
    });

    answer(Response.json({ data: { overrideQuadrant: { __typename: "OverrideSuccess", team } } }));
    expect(await first).toEqual({ ok: true, team });
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sent(fetch.mock.calls[1])).toMatchObject({ variables: { issueId: "i-2" } });
    expect(sent(fetch.mock.calls[1]).query).toContain("clearOverride");

    answer(Response.json({ data: { clearOverride: { __typename: "OverrideSuccess", team } } }));
    expect(await second).toEqual({ ok: true, team });
  });

  it("keeps going after a failed request", async () => {
    const { fetch, answer } = controlledFetch();
    const client = boardClient(false, fetch);
    const failed = client.placeIssue("i-1", "do");
    const next = client.placeIssue("i-1", "schedule");
    await flush();
    answer(new Response("Bad Gateway", { status: 502 }));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    expect(await failed).toMatchObject({ ok: false });
    await flush();
    answer(Response.json({ data: { overrideQuadrant: { __typename: "OverrideSuccess", team } } }));
    expect(await next).toEqual({ ok: true, team });
  });

  it("hands back what the server said was wrong, field by field", async () => {
    const problems = [{ field: "urgencyWindowDays", message: "1 to 365 whole days." }];
    const fetch = vi.fn(async () =>
      Response.json({
        data: { updateQuadrantRules: { __typename: "InvalidRules", message: "Nope.", problems } },
      }),
    );
    expect(await boardClient(false, fetch).updateRules("t-avg", rules)).toEqual({
      ok: false,
      message: "Nope.",
      problems,
    });
  });

  it("says what failed, like a spent rate limit, with no problems to mark", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        data: { overrideQuadrant: { __typename: "LinearRateLimited", message: "Try later." } },
      }),
    );
    expect(await boardClient(false, fetch).placeIssue("i-1", "do")).toEqual({
      ok: false,
      message: "Try later.",
      problems: [],
    });
  });

  it("turns top-level errors into a failure to show", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ data: null, errors: [{ message: "Unexpected error." }] }),
    );
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    expect(await boardClient(false, fetch).placeIssue("i-1", "do")).toEqual({
      ok: false,
      message: "Something went wrong. Please try again.",
      problems: [],
    });
  });

  it("says it's saved when only reading the board back failed", async () => {
    // Linear failing on the team's issues, after the override was written, nulls up to `data`.
    const fetch = vi.fn(async () =>
      Response.json({
        data: null,
        errors: [{ message: "Rate limited.", path: ["overrideQuadrant", "team", "people"] }],
      }),
    );
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    expect(await boardClient(false, fetch).placeIssue("i-1", "do")).toEqual({
      ok: true,
      team: null,
    });
  });
});
