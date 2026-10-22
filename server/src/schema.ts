// Our GraphQL schema: Linear's Issue, User and Team, extended with what the matrix derives
// from them (quadrant, placement reason, when an issue turns urgent, each person's matrix).

import SchemaBuilder from "@pothos/core";
import { GraphQLError } from "graphql";
import { buildMatrix, counts, type Matrix, points } from "./domain/matrix";
import type { CalendarDate, Quadrant, QuadrantRules } from "./domain/quadrant";
import { LinearAuthError } from "./linear/client";
import type { Assignee } from "./linear/team-issues";
import type { Placements } from "./placements";
import type { Team, TeamIssue, Viewer, Workspace } from "./workspace";

export interface GraphQLContext {
  /** Linear as the signed-in user sees it; null when nobody is signed in. */
  workspace: () => Promise<Workspace | null>;
  /** Each team's rules and the issues placed by hand, from our own database. */
  placements: Placements;
  /** The day issues are placed against. UTC, so near midnight a PM elsewhere may be a day off. */
  today: CalendarDate;
}

const builder = new SchemaBuilder<{
  Context: GraphQLContext;
  Scalars: { Date: { Input: CalendarDate; Output: CalendarDate } };
}>({});

/** A user, plus the team they were reached through, which their matrix defaults to. */
type UserModel = (Viewer | Assignee) & { teamId?: string };

type IssueModel = Matrix<TeamIssue>[Quadrant][number];

/** The matrix of some of a team's open issues, by the team's rules and any hand placements. */
async function teamMatrix(
  context: GraphQLContext,
  teamId: string,
  pick: (byAssignee: Map<string | null, TeamIssue[]>) => TeamIssue[] | undefined,
): Promise<Matrix<TeamIssue>> {
  const { byAssignee } = await (await signedIn(context)).teamWork(teamId);
  const issues = pick(byAssignee) ?? [];
  const [rules, overrides] = await Promise.all([
    context.placements.rules(teamId),
    context.placements.overrides(issues),
  ]);
  return buildMatrix(issues, rules, context.today, overrides);
}

async function signedIn(context: GraphQLContext): Promise<Workspace> {
  const workspace = await context.workspace();
  if (!workspace) {
    throw new GraphQLError("Sign in with Linear first", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return workspace;
}

builder.scalarType("Date", {
  description: "A calendar date, `YYYY-MM-DD`, with no time or zone. Like Linear's TimelessDate.",
  serialize: (date) => date,
  parseValue: (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new GraphQLError("Date must be a YYYY-MM-DD string");
    }
    return value;
  },
});

const QuadrantEnum = builder.enumType("Quadrant", {
  description: "An Eisenhower quadrant.",
  values: {
    DO: { value: "do", description: "Important and urgent." },
    SCHEDULE: { value: "schedule", description: "Important, not urgent yet." },
    DELEGATE: { value: "delegate", description: "Urgent, less important." },
    DROP: { value: "drop", description: "Neither: question it." },
  } as const,
});

const QuadrantSourceEnum = builder.enumType("QuadrantSource", {
  description: "What put an issue in its quadrant.",
  values: {
    RULE: { value: "rule", description: "The team's rules." },
    OVERRIDE: { value: "override", description: "A PM, by hand." },
  } as const,
});

const NoDueDateEnum = builder.enumType("NoDueDate", {
  description: "Where issues without a due date land.",
  values: {
    URGENT: { value: "urgent" },
    NOT_URGENT: { value: "notUrgent" },
  } as const,
});

const QuadrantRulesRef = builder.objectRef<QuadrantRules>("QuadrantRules").implement({
  description: "How a team sorts issues into quadrants.",
  fields: (t) => ({
    importantFrom: t.exposeInt("importantFrom", {
      description:
        "Lowest Linear priority that still counts as important (1 Urgent … 4 Low). No priority never does.",
    }),
    urgencyWindowDays: t.exposeInt("urgencyWindowDays", {
      description: "An issue is urgent when it's due in fewer than this many days, or overdue.",
    }),
    noDueDate: t.expose("noDueDate", { type: NoDueDateEnum }),
  }),
});

const OrganizationRef = builder.objectRef<Viewer["organization"]>("Organization").implement({
  description: "A Linear workspace.",
  fields: (t) => ({
    name: t.exposeString("name"),
    urlKey: t.exposeString("urlKey"),
  }),
});

const QuadrantCountsRef = builder.objectRef<Record<Quadrant, number>>("QuadrantCounts").implement({
  description: "How many issues are in each quadrant.",
  fields: (t) => ({
    do: t.exposeInt("do"),
    schedule: t.exposeInt("schedule"),
    delegate: t.exposeInt("delegate"),
    drop: t.exposeInt("drop"),
  }),
});

const QuadrantPointsRef = builder.objectRef<Record<Quadrant, number>>("QuadrantPoints").implement({
  description: "Estimate points in each quadrant. Unestimated issues add nothing.",
  fields: (t) => ({
    do: t.exposeFloat("do"),
    schedule: t.exposeFloat("schedule"),
    delegate: t.exposeFloat("delegate"),
    drop: t.exposeFloat("drop"),
  }),
});

const UserRef = builder.objectRef<UserModel>("User");
const TeamRef = builder.objectRef<Team>("Team");

const WorkflowStateRef = builder.objectRef<IssueModel["state"]>("WorkflowState").implement({
  description: "Where an issue is in its team's workflow.",
  fields: (t) => ({
    name: t.exposeString("name"),
    type: t.exposeString("type", {
      description: "Linear's state type: triage, backlog, unstarted, started, …",
    }),
  }),
});

const IssueRef = builder.objectRef<IssueModel>("Issue").implement({
  description: "An open Linear issue, placed in an Eisenhower quadrant.",
  fields: (t) => ({
    id: t.exposeID("id"),
    identifier: t.exposeString("identifier", { description: "E.g. ENG-123." }),
    title: t.exposeString("title"),
    url: t.exposeString("url", { description: "The issue in Linear." }),
    dueDate: t.expose("dueDate", { type: "Date", nullable: true }),
    priority: t.exposeInt("priority", {
      description: "0 No priority, 1 Urgent, 2 High, 3 Medium, 4 Low.",
    }),
    estimate: t.exposeFloat("estimate", { nullable: true }),
    state: t.field({ type: WorkflowStateRef, resolve: (issue) => issue.state }),
    assignee: t.field({
      type: UserRef,
      nullable: true,
      resolve: (issue) => issue.assignee ?? null,
    }),
    quadrant: t.expose("quadrant", { type: QuadrantEnum }),
    quadrantSource: t.expose("quadrantSource", { type: QuadrantSourceEnum }),
    placementReason: t.exposeString("placementReason", {
      description: 'Why it\'s in its quadrant, e.g. "High priority, due in 3 days".',
    }),
    becomesUrgentOn: t.expose("becomesUrgentOn", {
      type: "Date",
      nullable: true,
      description:
        "The first day the rules call it urgent: today if it already is (including undated issues when the team counts those as urgent), null if it never will be (undated, and the team doesn't).",
    }),
  }),
});

const MatrixRef = builder.objectRef<Matrix<TeamIssue>>("Matrix").implement({
  description: "Issues sorted into Eisenhower quadrants, each most pressing first.",
  fields: (t) => ({
    do: t.field({ type: [IssueRef], resolve: (matrix) => matrix.do }),
    schedule: t.field({ type: [IssueRef], resolve: (matrix) => matrix.schedule }),
    delegate: t.field({ type: [IssueRef], resolve: (matrix) => matrix.delegate }),
    drop: t.field({ type: [IssueRef], resolve: (matrix) => matrix.drop }),
    counts: t.field({ type: QuadrantCountsRef, resolve: (matrix) => counts(matrix) }),
    points: t.field({ type: QuadrantPointsRef, resolve: (matrix) => points(matrix) }),
  }),
});

UserRef.implement({
  description: "A Linear user.",
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    avatarUrl: t.exposeString("avatarUrl", { nullable: true }),
    organization: t.field({
      type: OrganizationRef,
      // A Linear user belongs to one workspace: the signed-in user's.
      resolve: async (user, _args, context) =>
        "organization" in user
          ? user.organization
          : (await (await signedIn(context)).viewer()).organization,
    }),
    matrix: t.field({
      type: MatrixRef,
      description: "Their open issues in a team, sorted into quadrants by the team's rules.",
      args: {
        teamId: t.arg.id({
          description: "Defaults to the team this user was reached through, e.g. Team.people.",
        }),
      },
      resolve: async (user, args, context) => {
        const teamId = args.teamId == null ? user.teamId : String(args.teamId);
        if (!teamId) throw new GraphQLError("Which team? Pass teamId.");
        return teamMatrix(context, teamId, (byAssignee) => byAssignee.get(user.id));
      },
    }),
  }),
});

TeamRef.implement({
  description: "A Linear team.",
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    key: t.exposeString("key", { description: "The prefix of its issue identifiers, e.g. ENG." }),
    rules: t.field({
      type: QuadrantRulesRef,
      resolve: (team, _args, context) => context.placements.rules(team.id),
    }),
    people: t.field({
      type: [UserRef],
      description:
        "Members by name, then anyone else holding the team's open issues, e.g. after moving teams.",
      resolve: async (team, _args, context) => {
        const { people } = await (await signedIn(context)).teamWork(team.id);
        return people.map((person) => ({ ...person, teamId: team.id }));
      },
    }),
    unassigned: t.field({
      type: MatrixRef,
      description: "The team's open issues nobody is assigned to.",
      resolve: (team, _args, context) =>
        teamMatrix(context, team.id, (byAssignee) => byAssignee.get(null)),
    }),
  }),
});

builder.queryType({
  fields: (t) => ({
    hello: t.string({ resolve: () => "☀️" }),
    today: t.field({
      type: "Date",
      description: "The day issues are placed against (UTC).",
      resolve: (_root, _args, context) => context.today,
    }),
    viewer: t.field({
      type: UserRef,
      nullable: true,
      description: "The signed-in Linear user, or null when signed out.",
      resolve: async (_root, _args, context) => {
        const workspace = await context.workspace();
        if (!workspace) return null;
        try {
          return await workspace.viewer();
        } catch (error) {
          // A revoked token means signed out, not a server error.
          if (error instanceof LinearAuthError) return null;
          throw error;
        }
      },
    }),
    // Nullable, so when Linear fails here the viewer still comes back.
    teams: t.field({
      type: [TeamRef],
      nullable: true,
      description: "Every team the viewer can see, by name.",
      resolve: async (_root, _args, context) => (await signedIn(context)).teams(),
    }),
    team: t.field({
      type: TeamRef,
      nullable: true,
      description:
        "The team with this id. Without one, or when it isn't a team you can see, your default: the first team you're on, else the first by name. Null only when there are no teams.",
      args: { id: t.arg.id() },
      resolve: async (_root, args, context) =>
        (await signedIn(context)).team(args.id == null ? null : String(args.id)),
    }),
  }),
});

export const schema = builder.toSchema();
