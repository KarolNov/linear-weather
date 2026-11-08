import { describe, expect, it, vi } from "vitest";
import type { Suggestion } from "./board";
import { applyMoves, boardClient, describeMoves, REASSIGN_MUTATION } from "./mutations";

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

/** The fields TeamBoard selects on the team itself, not inside `people` or `rules`. */
function teamFields(query: string) {
  const start = "fragment TeamBoard on Team {";
  const body = query.slice(query.indexOf(start) + start.length);
  const fields: string[] = [];
  let depth = 0;
  for (const token of body.match(/[{}]|\w+/g) ?? []) {
    if (token === "{") depth++;
    else if (token === "}" && depth-- === 0) break;
    else if (depth === 0 && token !== "}") fields.push(token);
  }
  return fields;
}

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

  it("asks for the team's weather back with each answer, so the sky can follow a change", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ data: { overrideQuadrant: { __typename: "OverrideSuccess", team } } }),
    );
    await boardClient(false, fetch).placeIssue("i-1", "do");
    await boardClient(false, fetch).updateRules("t-avg", rules);
    for (const call of fetch.mock.calls) {
      // The team's own weather, not only each person's.
      expect(teamFields(sent(call).query)).toContain("weather");
    }
  });

  it("hands an issue to someone else, answering with the team's board", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ data: { reassignIssue: { __typename: "ReassignSuccess", team } } }),
    );
    expect(await boardClient(false, fetch).reassign("i-1", "u-wanda")).toEqual({ ok: true, team });
    expect(sent(fetch.mock.calls[0])).toEqual({
      query: REASSIGN_MUTATION,
      variables: { issueId: "i-1", userId: "u-wanda" },
    });
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

describe("applying moves", () => {
  const person = (name: string) => ({ id: `u-${name}`, name, avatarUrl: null });
  const move = (n: number, to: string): Suggestion => ({
    issue: {
      id: `i-${n}`,
      identifier: `AVG-${n}`,
      title: `Issue ${n}`,
      url: `https://linear.app/x/issue/AVG-${n}`,
      quadrant: "DO",
      becomesUrgentOn: "2026-10-18",
    },
    from: person("tony"),
    to: person(to),
    week: null,
    toWeather: "CLOUDY",
    reason: "",
  });
  const moves = [move(1, "wanda"), move(2, "clint"), move(3, "steve")];

  /**
   * The server: each move answers with the board after it, unless it's one that fails. Reading
   * the board answers it as it stands.
   */
  function server(failing: Record<string, string> = {}, { readable = true } = {}) {
    return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const { issueId, teamId } = sent([_url, init]).variables as {
        issueId?: string;
        teamId?: string;
      };
      if (teamId) {
        return readable
          ? Response.json({ data: { team: { ...team, after: "read" } } })
          : new Response("Bad Gateway", { status: 502 });
      }
      const message = failing[issueId ?? ""];
      return Response.json({
        data: {
          reassignIssue: message
            ? { __typename: "LinearRateLimited", message }
            : { __typename: "ReassignSuccess", team: { ...team, after: issueId } },
        },
      });
    });
  }

  it("makes every move, one at a time in order, ending on the board after the last", async () => {
    const fetch = server();
    const applied = await applyMoves(boardClient(false, fetch), team.id, moves);
    expect(fetch.mock.calls.map((call) => sent(call).variables)).toEqual([
      { issueId: "i-1", userId: "u-wanda" },
      { issueId: "i-2", userId: "u-clint" },
      { issueId: "i-3", userId: "u-steve" },
    ]);
    expect(applied).toEqual({ moved: moves, failed: null, team: { ...team, after: "i-3" } });
  });

  it("stops at the first move that fails, saying which went through", async () => {
    const fetch = server({ "i-2": "Linear's rate limit is spent for now; try again later." });
    const applied = await applyMoves(boardClient(false, fetch), team.id, moves);
    expect(fetch.mock.calls.map((call) => sent(call).variables)).toEqual([
      { issueId: "i-1", userId: "u-wanda" },
      { issueId: "i-2", userId: "u-clint" },
      { teamId: team.id },
    ]);
    expect(applied).toEqual({
      moved: [moves[0]],
      failed: { move: moves[1], message: "Linear's rate limit is spent for now; try again later." },
      // Read again, from where things stand after the failure.
      team: { ...team, after: "read" },
    });
  });

  it("reads the board again when the first move fails, so it plans from where things stand", async () => {
    const fetch = server({ "i-1": "There's no such issue, or you can't see it." });
    const applied = await applyMoves(boardClient(false, fetch), team.id, moves);
    expect(applied).toMatchObject({ moved: [], team: { ...team, after: "read" } });
  });

  it("keeps the board after the last move made when it can't be read again", async () => {
    const fetch = server(
      { "i-2": "Linear's rate limit is spent for now; try again later." },
      { readable: false },
    );
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const applied = await applyMoves(boardClient(false, fetch), team.id, moves);
    expect(applied).toMatchObject({ moved: [moves[0]], team: { ...team, after: "i-1" } });
  });

  it("falls back to the newest board any answer carried, not the run's own", async () => {
    // Move 1 answers, a card moved meanwhile answers with a newer board, move 2 fails, and the
    // board can't be read again.
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const { query, variables } = sent([_url, init]);
      if (variables.teamId) return new Response("Bad Gateway", { status: 502 });
      if (query.includes("overrideQuadrant")) {
        return Response.json({
          data: {
            overrideQuadrant: { __typename: "OverrideSuccess", team: { ...team, after: "card" } },
          },
        });
      }
      return Response.json({
        data: {
          reassignIssue:
            variables.issueId === "i-1"
              ? { __typename: "ReassignSuccess", team: { ...team, after: "i-1" } }
              : { __typename: "LinearRateLimited", message: "Try later." },
        },
      });
    });
    const client = boardClient(false, fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const run = applyMoves(client, team.id, moves);
    // Queued behind move 1, ahead of move 2.
    void client.placeIssue("i-9", "drop");
    expect(await run).toMatchObject({ moved: [moves[0]], team: { ...team, after: "card" } });
  });

  it("never falls back to another team's board", async () => {
    const ops = { id: "t-ops", name: "Ops", key: "OPS" };
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const { variables } = sent([_url, init]);
      // A rules change carries a teamId too.
      if (variables.input) {
        return Response.json({
          data: { updateQuadrantRules: { __typename: "UpdateRulesSuccess", team: ops } },
        });
      }
      if (variables.teamId) return new Response("Bad Gateway", { status: 502 });
      return Response.json({
        data: { reassignIssue: { __typename: "LinearRateLimited", message: "Try later." } },
      });
    });
    const client = boardClient(false, fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await client.updateRules(ops.id, rules);
    expect(await applyMoves(client, team.id, moves)).toMatchObject({ moved: [], team: null });
  });

  it("remembers a board it read, for when the next read fails", async () => {
    let up = true;
    const fetch = vi.fn(async () =>
      up
        ? Response.json({ data: { team: { ...team, after: "read" } } })
        : new Response("Bad Gateway", { status: 502 }),
    );
    const client = boardClient(false, fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await client.readTeam(team.id);
    up = false;
    expect(await client.readTeam(team.id)).toEqual({ ...team, after: "read" });
  });

  describe("in words", () => {
    const failed = (n: number, message = "Try later.") => ({
      move: moves[n] as Suggestion,
      message,
    });

    it("says whose one issue is now", () => {
      expect(
        describeMoves([moves[0] as Suggestion], {
          moved: [moves[0] as Suggestion],
          failed: null,
          team: null,
        }),
      ).toEqual({
        status: "AVG-1 is wanda's now.",
      });
    });

    it("lists every move made, and that the board is planned again", () => {
      expect(describeMoves(moves, { moved: moves, failed: null, team: null })).toEqual({
        status:
          "Handed AVG-1 to wanda, AVG-2 to clint, and AVG-3 to steve. The board is planned again from here.",
      });
    });

    it("says which went through, which failed and why, and that the rest weren't made", () => {
      expect(
        describeMoves(moves, { moved: [moves[0] as Suggestion], failed: failed(1), team: null }),
      ).toEqual({
        failure:
          "Handed AVG-1 to wanda. Couldn't hand AVG-2 to clint, so the rest weren't made. Try later.",
      });
    });

    it("doesn't speak of the rest when the first of many fails before any went through", () => {
      expect(describeMoves(moves, { moved: [], failed: failed(0), team: null })).toEqual({
        failure: "Couldn't hand AVG-1 to wanda, so the rest weren't made. Try later.",
      });
    });

    it("has no rest to speak of when the last move fails", () => {
      const [first, second] = moves as [Suggestion, Suggestion];
      expect(
        describeMoves(moves, { moved: [first, second], failed: failed(2), team: null }),
      ).toEqual({
        failure:
          "Handed AVG-1 to wanda and AVG-2 to clint. Couldn't hand AVG-3 to steve. Try later.",
      });
    });
  });
});
