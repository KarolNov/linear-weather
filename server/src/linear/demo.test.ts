import { describe, expect, it } from "vitest";
import { addDays, becomesUrgentOn, classify, DEFAULT_RULES } from "../domain/quadrant";
import { DEMO_TEAM, DEMO_VIEWER, DemoLinear, demoIssues } from "./demo";
import { TeamOpenIssuesDocument, type TeamOpenIssuesQuery, ViewerDocument } from "./generated";
import { fetchTeamOpenIssues, groupByAssignee, type IssueCard } from "./team-issues";

const TODAY = "2026-10-18";
const issues = demoIssues(TODAY);

const quadrant =
  (today = TODAY) =>
  (issue: IssueCard) =>
    classify({ ...issue, priority: issue.priority as 0 | 1 | 2 | 3 | 4 }, DEFAULT_RULES, today)
      .quadrant;
const isUrgent = (issue: IssueCard) => becomesUrgentOn(issue, DEFAULT_RULES, TODAY) === TODAY;

describe("demoIssues", () => {
  it("is the same every time for the same day", () => {
    expect(demoIssues(TODAY)).toEqual(issues);
  });

  it("keeps due dates relative to today", () => {
    const tomorrow = demoIssues("2026-10-19");
    expect(tomorrow.map((i) => i.dueDate)).toEqual(
      issues.map((i) => (i.dueDate ? addDays(i.dueDate, 1) : null)),
    );
    expect(tomorrow.map(quadrant("2026-10-19"))).toEqual(issues.map(quadrant()));
  });

  it("gives every issue its own id and identifier", () => {
    expect(new Set(issues.map((i) => i.id)).size).toBe(issues.length);
    expect(new Set(issues.map((i) => i.identifier)).size).toBe(issues.length);
  });

  it("covers every case the board shows", () => {
    expect(new Set(issues.map(quadrant()))).toEqual(
      new Set(["do", "schedule", "delegate", "drop"]),
    );
    expect(new Set(issues.map((i) => i.priority))).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(issues.some((i) => i.dueDate !== null && i.dueDate < TODAY)).toBe(true);
    expect(issues.some((i) => i.dueDate === TODAY)).toBe(true);
    expect(issues.some((i) => i.dueDate === null)).toBe(true);
    expect(issues.some((i) => i.estimate === null)).toBe(true);
    expect(issues.some((i) => i.assignee === null)).toBe(true);
  });

  it("gives each Avenger the load the sign-in preview shows", () => {
    const load = Object.fromEntries(
      groupByAssignee(issues).map(({ assignee, issues }) => [
        assignee?.name ?? "Unassigned",
        {
          urgent: issues.filter(isUrgent).length,
          overdue: issues.filter((i) => i.dueDate !== null && i.dueDate < TODAY).length,
          undated: issues.filter((i) => i.dueDate === null).length,
        },
      ]),
    );
    expect(load).toMatchObject({
      "Tony Stark": { urgent: 11, overdue: 3 },
      "Steve Rogers": { urgent: 2 },
      "Natasha Romanoff": { urgent: 4 },
      "Bruce Banner": { urgent: 6 },
      "Thor Odinson": { urgent: 0, undated: 7 },
      "Clint Barton": { urgent: 1 },
    });
    expect(load["Wanda Maximoff"]).toBeUndefined();
  });

  it("only assigns issues to members of the team", () => {
    const members = new Set(DEMO_TEAM.members.map((m) => m.id));
    for (const { assignee } of issues) if (assignee) expect(members).toContain(assignee.id);
  });
});

describe("DemoLinear", () => {
  const demo = new DemoLinear({ today: TODAY });

  it("signs you in as Nick Fury", async () => {
    expect(await demo.request(ViewerDocument)).toEqual({ viewer: DEMO_VIEWER });
  });

  it("serves the team's issues through the same code as Linear", async () => {
    expect(await fetchTeamOpenIssues(demo, DEMO_TEAM.id)).toEqual(issues);
  });

  it("pages like Linear", async () => {
    const pages: IssueCard[][] = [];
    let after: string | null = null;
    for (;;) {
      const { issues: page }: TeamOpenIssuesQuery = await demo.request(TeamOpenIssuesDocument, {
        teamId: DEMO_TEAM.id,
        first: 20,
        after,
      });
      pages.push(page.nodes);
      if (!page.pageInfo.hasNextPage) break;
      after = page.pageInfo.endCursor;
    }
    expect(pages.map((p) => p.length)).toEqual([20, 20, issues.length - 40]);
    expect(pages.flat()).toEqual(issues);
  });

  it("has no issues for other teams", async () => {
    expect(await fetchTeamOpenIssues(demo, "some-other-team")).toEqual([]);
  });

  it("defaults to the current date", async () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(await fetchTeamOpenIssues(new DemoLinear(), DEMO_TEAM.id)).toEqual(demoIssues(today));
  });
});
