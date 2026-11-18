import { afterEach, describe, expect, it, vi } from "vitest";
import { LinearClient } from "./client";
import {
  BLOCKERS_PAGE_SIZE,
  blocksOpenWork,
  fetchOpenBlockers,
  fetchOpenIssues,
  type OpenBlocker,
  type OpenIssue,
  PAGE_SIZE,
} from "./team-issues";

const ada = {
  id: "u-ada",
  name: "Ada",
  avatarUrl: null,
  statusEmoji: null,
  statusLabel: null,
  statusUntilAt: null,
  timezone: null,
};
const grace = {
  id: "u-grace",
  name: "Grace",
  avatarUrl: "https://example.com/grace.png",
  statusEmoji: null,
  statusLabel: null,
  statusUntilAt: null,
  timezone: null,
};

function issue(n: number, assignee: OpenIssue["assignee"]): OpenIssue {
  return {
    id: `issue-${n}`,
    identifier: `ENG-${n}`,
    title: `Issue ${n}`,
    url: `https://linear.app/acme/issue/ENG-${n}`,
    dueDate: null,
    priority: 3,
    estimate: null,
    assignee,
    state: { name: "Todo", type: "unstarted" },
    team: { id: "team-1" },
  };
}

/** Answers like Linear's `issues` connection, one page per call, with the given headers. */
function mockPages<T>(pages: { nodes: T[]; headers?: Record<string, string> }[]) {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  pages.forEach(({ nodes, headers }, i) => {
    const last = i === pages.length - 1;
    fetchMock.mockImplementationOnce(async () =>
      Response.json(
        {
          data: {
            issues: {
              nodes,
              pageInfo: { hasNextPage: !last, endCursor: last ? null : `cursor-${i + 1}` },
            },
          },
        },
        { headers },
      ),
    );
  });
  return fetchMock;
}

async function sentVariables(fetchMock: ReturnType<typeof mockPages>, call: number) {
  const request = new Request(...(fetchMock.mock.calls[call] as Parameters<typeof fetch>));
  return ((await request.json()) as { variables: Record<string, unknown> }).variables;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchOpenIssues", () => {
  it("follows the cursor until the last page", async () => {
    const fetchMock = mockPages([
      { nodes: [issue(1, ada), issue(2, grace)] },
      { nodes: [issue(3, ada)] },
      { nodes: [issue(4, null)] },
    ]);

    const issues = await fetchOpenIssues(new LinearClient("Bearer t"), ["team-1", "team-2"]);

    expect(issues.map((i) => i.identifier)).toEqual(["ENG-1", "ENG-2", "ENG-3", "ENG-4"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await sentVariables(fetchMock, 0)).toEqual({
      teamIds: ["team-1", "team-2"],
      first: PAGE_SIZE,
      after: null,
    });
    expect(await sentVariables(fetchMock, 1)).toMatchObject({ after: "cursor-1" });
    expect(await sentVariables(fetchMock, 2)).toMatchObject({ after: "cursor-2" });
  });

  it("fails rather than return a partial list when Linear gives no cursor", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () =>
      Response.json({
        data: {
          issues: { nodes: [issue(1, ada)], pageInfo: { hasNextPage: true, endCursor: null } },
        },
      }),
    );

    await expect(
      fetchOpenIssues(new LinearClient("Bearer t"), ["team-1", "team-2"]),
    ).rejects.toThrow("no cursor");
  });
});

/** A blocker whose relations are of these types, to issues in these states. */
function blocker(
  n: number,
  relations: [type: string, state: string][],
  hasNextPage = false,
): OpenBlocker {
  return {
    id: `issue-${n}`,
    team: { id: "team-1" },
    relations: {
      nodes: relations.map(([type, state]) => ({ type, relatedIssue: { state: { type: state } } })),
      pageInfo: { hasNextPage },
    },
  };
}

describe("fetchOpenBlockers", () => {
  it("follows the cursor in pages small enough for the relations they carry", async () => {
    const fetchMock = mockPages([
      { nodes: [blocker(1, [["blocks", "started"]])] },
      { nodes: [blocker(2, [["blocks", "backlog"]])] },
    ]);

    const blockers = await fetchOpenBlockers(new LinearClient("Bearer t"), ["team-1"]);

    expect(blockers.map((b) => b.id)).toEqual(["issue-1", "issue-2"]);
    expect(await sentVariables(fetchMock, 0)).toEqual({
      teamIds: ["team-1"],
      first: BLOCKERS_PAGE_SIZE,
      after: null,
    });
    expect(await sentVariables(fetchMock, 1)).toMatchObject({ after: "cursor-1" });
  });
});

describe("blocksOpenWork", () => {
  it("is true when it blocks an issue that's still open", () => {
    expect(blocksOpenWork(blocker(1, [["blocks", "unstarted"]]))).toBe(true);
    expect(
      blocksOpenWork(
        blocker(1, [
          ["blocks", "completed"],
          ["blocks", "triage"],
        ]),
      ),
    ).toBe(true);
  });

  it("is false when everything it blocks is done", () => {
    expect(
      blocksOpenWork(
        blocker(1, [
          ["blocks", "completed"],
          ["blocks", "canceled"],
        ]),
      ),
    ).toBe(false);
  });

  it("ignores relations that aren't blocking", () => {
    expect(
      blocksOpenWork(
        blocker(1, [
          ["related", "started"],
          ["duplicate", "backlog"],
        ]),
      ),
    ).toBe(false);
    expect(blocksOpenWork(blocker(1, []))).toBe(false);
  });

  it("says so when more relations than it read might hold an open block", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(blocksOpenWork(blocker(1, [["related", "started"]], true))).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("issue-1"));
    warn.mockClear();
    expect(blocksOpenWork(blocker(2, [["blocks", "started"]], true))).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});
