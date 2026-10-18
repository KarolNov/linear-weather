import { afterEach, describe, expect, it, vi } from "vitest";
import { LinearClient, LinearRateLimitError } from "./client";
import { fetchTeamOpenIssues, groupByAssignee, type IssueCard, PAGE_SIZE } from "./team-issues";

const ada = { id: "u-ada", name: "Ada", avatarUrl: null };
const grace = { id: "u-grace", name: "Grace", avatarUrl: "https://example.com/grace.png" };

function issue(n: number, assignee: IssueCard["assignee"]): IssueCard {
  return {
    id: `issue-${n}`,
    identifier: `ENG-${n}`,
    title: `Issue ${n}`,
    dueDate: null,
    priority: 3,
    estimate: null,
    assignee,
    state: { name: "Todo", type: "unstarted" },
  };
}

/** Answers like Linear's `issues` connection, one page per call, with the given headers. */
function mockPages(pages: { nodes: IssueCard[]; headers?: Record<string, string> }[]) {
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

describe("fetchTeamOpenIssues", () => {
  it("follows the cursor until the last page", async () => {
    const fetchMock = mockPages([
      { nodes: [issue(1, ada), issue(2, grace)] },
      { nodes: [issue(3, ada)] },
      { nodes: [issue(4, null)] },
    ]);

    const issues = await fetchTeamOpenIssues(new LinearClient("Bearer t"), "team-1");

    expect(issues.map((i) => i.identifier)).toEqual(["ENG-1", "ENG-2", "ENG-3", "ENG-4"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await sentVariables(fetchMock, 0)).toEqual({
      teamId: "team-1",
      first: PAGE_SIZE,
      after: null,
    });
    expect(await sentVariables(fetchMock, 1)).toMatchObject({ after: "cursor-1" });
    expect(await sentVariables(fetchMock, 2)).toMatchObject({ after: "cursor-2" });
  });

  it("stops before a page the remaining complexity budget can't cover", async () => {
    const fetchMock = mockPages([
      {
        nodes: [issue(1, ada)],
        headers: {
          "x-complexity": "1026",
          "x-ratelimit-complexity-remaining": "900",
          "x-ratelimit-complexity-reset": "1800000000000",
        },
      },
      { nodes: [issue(2, ada)] },
    ]);

    const error = await fetchTeamOpenIssues(new LinearClient("Bearer t"), "team-1").catch((e) => e);
    expect(error).toBeInstanceOf(LinearRateLimitError);
    expect(error.resetAt).toBe(1_800_000_000_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("groupByAssignee", () => {
  it("groups issues per person, unassigned last", () => {
    const issues = [issue(1, null), issue(2, ada), issue(3, grace), issue(4, ada)];

    expect(
      groupByAssignee(issues).map((g) => [g.assignee?.name ?? null, g.issues.map((i) => i.id)]),
    ).toEqual([
      ["Ada", ["issue-2", "issue-4"]],
      ["Grace", ["issue-3"]],
      [null, ["issue-1"]],
    ]);
  });

  it("returns no groups for no issues", () => {
    expect(groupByAssignee([])).toEqual([]);
  });
});
