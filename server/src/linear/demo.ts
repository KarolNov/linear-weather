// A mocked Linear workspace: the original Avengers, with Nick Fury as their PM. It answers the
// same typed queries as Linear's API, so the board can be built and demoed without a Linear
// workspace. Deterministic: due dates are offsets from "today", nothing is random.

import { addDays, type CalendarDate, type LinearPriority } from "../domain/quadrant";
import type { LinearSource } from "./client";
import {
  TeamOpenIssuesDocument,
  type TeamOpenIssuesQuery,
  type TeamOpenIssuesQueryVariables,
  type TypedDocumentString,
  ViewerDocument,
  type ViewerQuery,
} from "./generated";
import type { Assignee, IssueCard } from "./team-issues";

const member = (key: string, name: string): Assignee => ({
  id: `demo-user-${key}`,
  name,
  avatarUrl: null,
});

const tony = member("tony", "Tony Stark");
const steve = member("steve", "Steve Rogers");
const natasha = member("natasha", "Natasha Romanoff");
const bruce = member("bruce", "Bruce Banner");
const thor = member("thor", "Thor Odinson");
const clint = member("clint", "Clint Barton");
const wanda = member("wanda", "Wanda Maximoff");

export const DEMO_VIEWER: ViewerQuery["viewer"] = {
  id: "demo-user-fury",
  name: "Nick Fury",
  avatarUrl: null,
  organization: { name: "S.H.I.E.L.D.", urlKey: "shield" },
};

export const DEMO_TEAM = {
  id: "demo-team-avengers",
  name: "Avengers",
  key: "AVG",
  /**
   * Everyone on the team. Wanda has nothing assigned, so she never shows up in the issues:
   * she's here for the empty plate, once the board lists members as well as issues.
   */
  members: [tony, steve, natasha, bruce, thor, clint, wanda],
};

type StateName = "Triage" | "Backlog" | "Todo" | "In Progress" | "In Review";

const STATE_TYPE: Record<StateName, string> = {
  Triage: "triage",
  Backlog: "backlog",
  Todo: "unstarted",
  "In Progress": "started",
  "In Review": "started",
};

/**
 * One open issue: who has it, what it is, priority, due in how many days from today (negative
 * is overdue, null is no due date), estimate (null is unestimated), and workflow state.
 */
type DemoIssue = [
  assignee: Assignee | null,
  title: string,
  priority: LinearPriority,
  dueInDays: number | null,
  estimate: number | null,
  state: StateName,
];

// Matches the sign-in page's preview. With the default rules (urgent = due within 14 days or
// overdue; important = Medium priority or higher):
// - Tony is overloaded: 11 urgent, 3 of them overdue, and one due today.
// - Steve has 2 urgent, Natasha 4, Bruce 6 with more turning urgent next week, Clint 1.
// - Thor's work has no due dates: fog.
// - Every quadrant and every priority appears, some issues are unestimated, and a few are
//   unassigned.
const ISSUES: DemoIssue[] = [
  [tony, "Patch the arc reactor's memory leak", 1, -5, 5, "In Progress"],
  [tony, "Recall the Mark XLII suits that fly off on their own", 1, -2, 8, "In Progress"],
  [tony, "Answer the board about the Stark Expo budget", 3, -1, null, "Todo"],
  [tony, "Ship JARVIS voice commands to the Quinjet", 2, 0, 3, "In Progress"],
  [tony, "Rewire the Helicarrier's turbines", 1, 1, 8, "In Progress"],
  [tony, "Upgrade War Machine's targeting", 2, 2, 5, "Todo"],
  [tony, "Review Ultron's code before anyone runs it", 1, 3, 13, "In Review"],
  [tony, "Fix the Tower elevator that talks back", 4, 4, 1, "Todo"],
  [tony, "Sign off on Spider-Man's suit permissions", 3, 6, 2, "Todo"],
  [tony, "Replace the repulsor gloves' firmware", 2, 9, null, "Todo"],
  [tony, "Stock the lab with more blueberries", 0, 12, null, "Todo"],
  [tony, "Design a suit for deep space", 2, 20, 13, "Backlog"],
  [tony, "Tidy the workshop", 4, null, 1, "Backlog"],

  [steve, "Brief the team on the Sokovia Accords", 2, 5, 2, "In Progress"],
  [steve, "Find Bucky's last known location", 1, 10, 5, "In Progress"],
  [steve, "Update the shield-throwing training plan", 3, 25, 3, "Todo"],
  [steve, "Catch up on the last 70 years", 4, null, null, "Backlog"],
  [steve, "Restore the 1940s motorcycle", 4, 40, 2, "Backlog"],

  [natasha, "Debrief on Budapest", 2, -3, 3, "In Progress"],
  [natasha, "Infiltrate the HYDRA cell in Lagos", 1, 4, 8, "In Progress"],
  [natasha, "Rotate the safehouse codes", 3, 8, 1, "Todo"],
  [natasha, "Audit the Red Room files", 2, 11, 5, "In Review"],
  [natasha, "Plan the Moscow extraction", 2, 16, 5, "Todo"],
  [natasha, "Teach Clint's kids to play chess", 0, 30, null, "Todo"],

  [bruce, "Calibrate the gamma radiation sensors", 2, 1, 3, "In Progress"],
  [bruce, "Write up the Hulk containment protocol", 1, 2, 8, "In Progress"],
  [bruce, "Repair the lab door (again)", 4, 3, 2, "Todo"],
  [bruce, "Peer-review Tony's Ultron paper", 2, 6, 3, "In Review"],
  [bruce, "Order more stretchy purple trousers", 4, 7, null, "Todo"],
  [bruce, "Brew a calming tea for the lab", 3, 13, 1, "Todo"],
  [bruce, "Model the Tesseract's energy signature", 1, 14, 13, "Backlog"],
  [bruce, "Prepare the Culver University lecture", 2, 17, 5, "Todo"],
  [bruce, "Publish the cell regeneration study", 3, 19, 8, "Todo"],

  [thor, "Return Mjölnir to its rightful spot", 2, null, 1, "Todo"],
  [thor, "Find the Infinity Stones", 1, null, null, "Backlog"],
  [thor, "Learn how the coffee machine works", 4, null, 1, "Triage"],
  [thor, "Visit Jane in New Mexico", 3, null, 2, "Backlog"],
  [thor, "Settle things with Loki", 1, null, 13, "Backlog"],
  [thor, "Repair the Bifrost", 2, null, null, "In Progress"],
  [thor, "Explain Asgardian table manners", 0, null, null, "Backlog"],
  [thor, "Run hammer drills with the team", 3, 22, 3, "Todo"],

  [clint, "Restock the trick arrows", 3, 6, 2, "In Progress"],
  [clint, "Fix the farmhouse roof", 4, null, 3, "Backlog"],

  [null, "Triage the Chitauri wreckage reports", 1, -4, null, "Triage"],
  [null, "Decide who pays for the New York cleanup", 2, null, null, "Backlog"],
  [null, "Repaint the Tower logo", 4, 9, 2, "Todo"],
  [null, "Rename the Quinjet", 0, null, 1, "Backlog"],
];

/** The Avengers' open issues, with due dates counted from `today`. */
export function demoIssues(today: CalendarDate): IssueCard[] {
  return ISSUES.map(([assignee, title, priority, dueInDays, estimate, state], i) => ({
    id: `demo-issue-${i + 1}`,
    identifier: `${DEMO_TEAM.key}-${i + 1}`,
    title,
    dueDate: dueInDays === null ? null : addDays(today, dueInDays),
    priority,
    estimate,
    assignee,
    state: { name: state, type: STATE_TYPE[state] },
  }));
}

export interface DemoLinearOptions {
  /** The demo's "today". Defaults to the current UTC date, read on every request. */
  today?: CalendarDate;
}

/** A `LinearSource` that answers from the mocked Avengers workspace instead of Linear. */
export class DemoLinear implements LinearSource {
  constructor(private readonly options: DemoLinearOptions = {}) {}

  async request<TResult, TVariables>(
    document: TypedDocumentString<TResult, TVariables>,
    ...[variables]: TVariables extends Record<string, never> ? [] : [TVariables]
  ): Promise<TResult> {
    const query = document.toString();
    if (query === ViewerDocument.toString()) {
      return { viewer: DEMO_VIEWER } satisfies ViewerQuery as TResult;
    }
    if (query === TeamOpenIssuesDocument.toString()) {
      return this.teamOpenIssues(variables as TeamOpenIssuesQueryVariables) as TResult;
    }
    throw new Error(`The demo workspace can't answer this query yet:\n${query}`);
  }

  /** Pages like Linear's `issues` connection; cursors are the index of the next issue. */
  private teamOpenIssues({ teamId, first, after }: TeamOpenIssuesQueryVariables) {
    const today = this.options.today ?? new Date().toISOString().slice(0, 10);
    const all = teamId === DEMO_TEAM.id ? demoIssues(today) : [];
    const start = after ? Number(after) : 0;
    const nodes = all.slice(start, start + first);
    const end = start + nodes.length;
    return {
      issues: {
        nodes,
        // Like Linear, the last page still has a cursor unless it's empty.
        pageInfo: { hasNextPage: end < all.length, endCursor: nodes.length ? String(end) : null },
      },
    } satisfies TeamOpenIssuesQuery;
  }
}
