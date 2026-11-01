// Our GraphQL schema: Linear's Issue, User and Team, extended with what the matrix derives
// from them (quadrant, placement reason, when an issue turns urgent, each person's matrix).

import SchemaBuilder from "@pothos/core";
import { GraphQLError } from "graphql";
import {
  type ForecastWeek,
  forecast,
  isForecastHorizon,
  MAX_FORECAST_WEEKS,
  type TeamForecast,
} from "./domain/forecast";
import { buildMatrix, counts, type Matrix, place, points } from "./domain/matrix";
import {
  type CalendarDate,
  MAX_URGENCY_WINDOW_DAYS,
  parseRules,
  type Quadrant,
  type QuadrantRules,
  type RuleProblem,
} from "./domain/quadrant";
import { type Horizon, rebalanceAhead, rebalanceNow, type Suggestion } from "./domain/rebalance";
import {
  DEFAULT_THRESHOLDS,
  type LoadMetric,
  loadMetricFor,
  teamWeather,
  type Weather,
} from "./domain/weather";
import { LinearAuthError, LinearForbiddenError, LinearRateLimitError } from "./linear/client";
import type { Assignee } from "./linear/team-issues";
import type { Placements } from "./placements";
import type { Team, TeamIssue, Viewer, Workspace } from "./workspace";

export interface GraphQLContext {
  /** Linear as the signed-in user sees it; null when nobody is signed in. */
  workspace: () => Promise<Workspace | null>;
  /**
   * Each team's rules and the issues placed by hand: from our own database, or for the demo,
   * from the visitor's browser.
   */
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

/** Work a request's resolvers share, by key, so each piece is done once per request. */
const perRequest = new WeakMap<GraphQLContext, Map<string, Promise<unknown>>>();

function once<T>(context: GraphQLContext, key: string, load: () => Promise<T>): Promise<T> {
  let byKey = perRequest.get(context);
  if (!byKey) {
    byKey = new Map();
    perRequest.set(context, byKey);
  }
  let result = byKey.get(key) as Promise<T> | undefined;
  if (!result) {
    result = load();
    byKey.set(key, result);
  }
  return result;
}

/** After a write: what this request worked out before it may no longer hold. */
function forgetWork(context: GraphQLContext): void {
  perRequest.delete(context);
}

/**
 * The matrix of one assignee's open issues in a team (null for the unassigned ones), by the
 * team's rules and any hand placements.
 */
function teamMatrix(
  context: GraphQLContext,
  teamId: string,
  assigneeId: string | null,
): Promise<Matrix<TeamIssue>> {
  return once(context, `matrix:${teamId}:${assigneeId}`, async () => {
    const { byAssignee } = await (await signedIn(context)).teamWork(teamId);
    const issues = byAssignee.get(assigneeId) ?? [];
    const [rules, overrides] = await Promise.all([
      context.placements.rules(teamId),
      context.placements.overrides(issues),
    ]);
    return buildMatrix(issues, rules, context.today, overrides);
  });
}

/** Each of a team's people with their matrix. */
async function peopleMatrices(
  context: GraphQLContext,
  teamId: string,
): Promise<{ person: Assignee; matrix: Matrix<TeamIssue> }[]> {
  const { people } = await (await signedIn(context)).teamWork(teamId);
  return Promise.all(
    people.map(async (person) => ({
      person,
      matrix: await teamMatrix(context, teamId, person.id),
    })),
  );
}

async function teamLoadMetric(context: GraphQLContext, teamId: string): Promise<LoadMetric> {
  return loadMetricFor((await peopleMatrices(context, teamId)).map(({ matrix }) => matrix));
}

interface TeamWeatherModel {
  metric: LoadMetric;
  byPerson: Map<string, Weather>;
  team: Weather;
}

/** A team's weather now, counting load in `metric`, else in whatever suits the team. */
async function teamWeatherOf(
  context: GraphQLContext,
  teamId: string,
  metric: LoadMetric | null | undefined,
): Promise<TeamWeatherModel> {
  if (!metric) return teamWeatherOf(context, teamId, await teamLoadMetric(context, teamId));
  // Everyone's is worked out together, once per metric.
  return once(context, `weather:${teamId}:${metric}`, async () => {
    const people = await peopleMatrices(context, teamId);
    const weather = teamWeather(
      people.map(({ person, matrix }) => ({ name: person.name, matrix })),
      metric,
      context.today,
    );
    return {
      metric,
      byPerson: new Map(people.map(({ person }, i) => [person.id, weather.people[i] as Weather])),
      team: weather.team,
    };
  });
}

/** A team's forecast for `weeks` weeks, counting load in `metric`, else in what suits the weeks. */
async function teamForecastOf(
  context: GraphQLContext,
  teamId: string,
  weeks: number,
  metric: LoadMetric | null | undefined,
): Promise<{ byPerson: Map<string, ForecastWeek<TeamIssue>[]>; team: TeamForecast<TeamIssue> }> {
  if (!isForecastHorizon(weeks)) {
    throw new GraphQLError(`A forecast covers 1 to ${MAX_FORECAST_WEEKS} weeks.`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return once(context, `forecast:${teamId}:${metric ?? "auto"}:${weeks}`, async () => {
    const people = await peopleMatrices(context, teamId);
    const projected = forecast(
      people.map(({ person, matrix }) => ({ name: person.name, matrix })),
      metric ?? null,
      context.today,
      weeks,
    );
    return {
      byPerson: new Map(
        people.map(({ person }, i) => [
          person.id,
          projected.people[i] as ForecastWeek<TeamIssue>[],
        ]),
      ),
      team: projected,
    };
  });
}

/** Today's moves in a team, and the board they leave, counting load in `metric` or as the weather does. */
function rebalanceNowOf(context: GraphQLContext, teamId: string, metric: LoadMetric | null) {
  return once(context, `rebalance:now:${teamId}:${metric ?? "auto"}`, async () => {
    const people = await peopleMatrices(context, teamId);
    return rebalanceNow(
      people.map(({ person, matrix }) => ({ ...person, teamId, matrix })),
      metric,
      context.today,
    );
  });
}

/** Who should hand which issue to whom, so nobody is overloaded now or in the weeks ahead. */
async function rebalanceOf(
  context: GraphQLContext,
  teamId: string,
  horizon: Horizon,
  weeks: number,
  metric: LoadMetric | null | undefined,
): Promise<Suggestion<UserModel, TeamIssue>[]> {
  if (horizon === "now") return (await rebalanceNowOf(context, teamId, metric ?? null)).suggestions;
  if (!isForecastHorizon(weeks)) {
    throw new GraphQLError(`A forecast covers 1 to ${MAX_FORECAST_WEEKS} weeks.`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return once(context, `rebalance:forecast:${teamId}:${metric ?? "auto"}:${weeks}`, async () => {
    // From the board today's moves leave, as the NOW list (by default) shows them.
    const { after } = await rebalanceNowOf(context, teamId, null);
    return rebalanceAhead(after, metric ?? null, context.today, { weeks });
  });
}

/** Someone's weather in a team they're not on and hold none of the issues of: nothing to measure. */
function notOnTeam(team: Weather): Weather {
  return {
    kind: "fog",
    metric: team.metric,
    load: null,
    teamAverage: team.teamAverage,
    overdue: 0,
    reason: "Not on this team",
  };
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

const WeatherKindEnum = builder.enumType("WeatherKind", {
  description: "How heavy urgent (Do + Delegate) load is, against the team's average.",
  values: {
    SUNNY: {
      value: "sunny",
      description: `Nothing urgent, or under ${DEFAULT_THRESHOLDS.sunnyBelow}× the average: room for more.`,
    },
    CLOUDY: { value: "cloudy", description: "Around average." },
    RAIN: {
      value: "rain",
      description: `Noticeably above average (over ${DEFAULT_THRESHOLDS.rainAbove}×).`,
    },
    STORM: {
      value: "storm",
      description: `Far above average (over ${DEFAULT_THRESHOLDS.stormAbove}×), or urgent issues overdue.`,
    },
    FOG: {
      value: "fog",
      description:
        "Can't tell: nothing urgent but some work has no due date; counting points with some urgent issue unestimated; or nobody else on the team to compare with.",
    },
  } as const,
});

const LoadMetricEnum = builder.enumType("LoadMetric", {
  description: "What urgent load is counted in.",
  values: {
    POINTS: {
      value: "points",
      description: "Estimate points. Anyone with an unestimated urgent issue can't be measured.",
    },
    ISSUES: { value: "issues", description: "Issues, whatever their size." },
  } as const,
});

const WeatherRef = builder.objectRef<Weather>("Weather").implement({
  description: "The weather now: urgent (Do + Delegate) load against the team's average.",
  fields: (t) => ({
    kind: t.expose("kind", { type: WeatherKindEnum }),
    metric: t.expose("metric", { type: LoadMetricEnum }),
    load: t.exposeFloat("load", {
      nullable: true,
      description:
        "A person's urgent load; for a team, its busiest person's. Null when it can't be measured.",
    }),
    teamAverage: t.exposeFloat("teamAverage", {
      nullable: true,
      description:
        "The mean urgent load of the team's people whose load could be measured. Null when fewer than two could: nobody to compare with.",
    }),
    overdue: t.exposeInt("overdue", {
      description:
        "Urgent (Do or Delegate) issues past their due date, which mean a storm whatever the load; for a team, everyone's.",
    }),
    reason: t.exposeString("reason", {
      description: 'Why, e.g. "13 urgent points, 3.07× the team average; 2 issues overdue".',
    }),
  }),
});

const ForecastWeekRef = builder.objectRef<ForecastWeek<TeamIssue>>("ForecastWeek");

const TeamForecastRef = builder.objectRef<TeamForecast<TeamIssue>>("TeamForecast").implement({
  description: "How evenly a team's urgent load is expected to be spread, week by week.",
  fields: (t) => ({
    weeks: t.field({ type: [ForecastWeekRef], resolve: (forecast) => forecast.team }),
    worst: t.field({
      type: ForecastWeekRef,
      description:
        "The most lopsided week (storm, then rain, then fog, then cloudy), the earliest of equals: the team's score over the horizon.",
      resolve: (forecast) => forecast.worst,
    }),
  }),
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

const QuadrantRulesInput = builder.inputType("QuadrantRulesInput", {
  description: "A team's new rules, all of them: the ones left as they were included.",
  fields: (t) => ({
    importantFrom: t.int({
      required: true,
      description: "Lowest Linear priority that still counts as important: 1 Urgent … 4 Low.",
    }),
    urgencyWindowDays: t.int({
      required: true,
      description: `Urgent when due in fewer than this many days, or overdue: 1 to ${MAX_URGENCY_WINDOW_DAYS}.`,
    }),
    noDueDate: t.field({ type: NoDueDateEnum, required: true }),
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

ForecastWeekRef.implement({
  description:
    "One week ahead: the urgent load expected by its last day, assuming issues turn urgent when their due dates say, hand placements stay, and work is done by its due date (work already overdue stays).",
  fields: (t) => ({
    startsOn: t.expose("startsOn", { type: "Date", description: "Today for the first week." }),
    endsOn: t.expose("endsOn", { type: "Date" }),
    weather: t.expose("weather", {
      type: WeatherRef,
      description: "Against that week's projected team average.",
    }),
    turningUrgent: t.expose("turningUrgent", {
      type: [IssueRef],
      description: "Issues that turn urgent during the week (not those urgent already).",
    }),
    summary: t.exposeString("summary", {
      description: 'What turns urgent, e.g. "3 High-priority issues become urgent".',
    }),
  }),
});

const FORECAST_WEEKS = 4;

const HorizonEnum = builder.enumType("Horizon", {
  description: "When a rebalance is for.",
  values: {
    NOW: { value: "now", description: "Today's urgent load: moves work that is urgent now." },
    FORECAST: {
      value: "forecast",
      description: "The weeks ahead: moves work before it turns urgent, so a storm never arrives.",
    },
  } as const,
});

const SuggestionRef = builder.objectRef<Suggestion<UserModel, TeamIssue>>("Suggestion").implement({
  description: "Hand one issue from one person to another to even out urgent load.",
  fields: (t) => ({
    issue: t.expose("issue", { type: IssueRef }),
    from: t.expose("from", { type: UserRef, description: "Who holds it now." }),
    to: t.expose("to", { type: UserRef, description: "Who should take it." }),
    week: t.exposeInt("week", {
      nullable: true,
      description: "For FORECAST, the week the move heads a storm off in (1 = this week).",
    }),
    fromWeather: t.expose("fromWeather", {
      type: WeatherKindEnum,
      description: "The giver's weather after the move, now or in that week.",
    }),
    toWeather: t.expose("toWeather", {
      type: WeatherKindEnum,
      description: "The taker's weather after the move, now or in that week.",
    }),
    reason: t.exposeString("reason", {
      description:
        'How the move evens things out, e.g. "Ana goes from 2.1× to 1.4× the team average, Ben from 0.5× to 1.1×".',
    }),
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
        return teamMatrix(context, teamId, user.id);
      },
    }),
    weather: t.field({
      type: WeatherRef,
      description: "Their urgent load in a team now, against the team's average.",
      args: {
        teamId: t.arg.id({
          description: "Defaults to the team this user was reached through, e.g. Team.people.",
        }),
        metric: t.arg({
          type: LoadMetricEnum,
          description: "Defaults to the team's loadMetric.",
        }),
      },
      resolve: async (user, args, context): Promise<Weather> => {
        const teamId = args.teamId == null ? user.teamId : String(args.teamId);
        if (!teamId) throw new GraphQLError("Which team? Pass teamId.");
        const weather = await teamWeatherOf(context, teamId, args.metric);
        const theirs = weather.byPerson.get(user.id);
        if (theirs) return theirs;
        return notOnTeam(weather.team);
      },
    }),
    forecast: t.field({
      type: [ForecastWeekRef],
      description:
        "Their weather in a team for the weeks ahead, as dated issues turn urgent. The first week starts today.",
      args: {
        teamId: t.arg.id({
          description: "Defaults to the team this user was reached through, e.g. Team.people.",
        }),
        weeks: t.arg.int({
          required: true,
          defaultValue: FORECAST_WEEKS,
          description: `1 to ${MAX_FORECAST_WEEKS}.`,
        }),
        metric: t.arg({
          type: LoadMetricEnum,
          description:
            "Defaults to POINTS if every issue urgent in any of the weeks is estimated, else ISSUES.",
        }),
      },
      resolve: async (user, args, context) => {
        const teamId = args.teamId == null ? user.teamId : String(args.teamId);
        if (!teamId) throw new GraphQLError("Which team? Pass teamId.");
        const projected = await teamForecastOf(context, teamId, args.weeks, args.metric);
        const theirs = projected.byPerson.get(user.id);
        if (theirs) return theirs;
        return projected.team.team.map((week) => ({
          ...week,
          weather: notOnTeam(week.weather),
          turningUrgent: [],
          summary: "Not on this team",
        }));
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
      resolve: (team, _args, context) => teamMatrix(context, team.id, null),
    }),
    loadMetric: t.field({
      type: LoadMetricEnum,
      description:
        "What weather counts load in by default: points if every urgent issue its people hold is estimated, else issues.",
      resolve: (team, _args, context) => teamLoadMetric(context, team.id),
    }),
    weather: t.field({
      type: WeatherRef,
      description:
        "How evenly urgent load is spread now: as stormy or rainy as the worst person; else sunny when everyone is around the average, cloudy when some have room while others carry it.",
      args: {
        metric: t.arg({ type: LoadMetricEnum, description: "Defaults to the team's loadMetric." }),
      },
      resolve: async (team, args, context) =>
        (await teamWeatherOf(context, team.id, args.metric)).team,
    }),
    forecast: t.field({
      type: TeamForecastRef,
      description:
        "How evenly urgent load is expected to be spread in the weeks ahead, and the worst week.",
      args: {
        weeks: t.arg.int({
          required: true,
          defaultValue: FORECAST_WEEKS,
          description: `1 to ${MAX_FORECAST_WEEKS}.`,
        }),
        metric: t.arg({
          type: LoadMetricEnum,
          description:
            "Defaults to POINTS if every issue urgent in any of the weeks is estimated, else ISSUES.",
        }),
      },
      resolve: async (team, args, context) =>
        (await teamForecastOf(context, team.id, args.weeks, args.metric)).team,
    }),
    rebalanceSuggestions: t.field({
      type: [SuggestionRef],
      description:
        "Moves that bring everyone's urgent load within the weather's thresholds, in the order to make them. Greedy: the busiest person hands the least busy whichever issue leaves them closest, until nobody is under rain or in a storm by load. Overdue work stays put, and nobody running late takes more.",
      args: {
        horizon: t.arg({ type: HorizonEnum, required: true }),
        weeks: t.arg.int({
          required: true,
          defaultValue: FORECAST_WEEKS,
          description: `For FORECAST: 1 to ${MAX_FORECAST_WEEKS}.`,
        }),
        metric: t.arg({
          type: LoadMetricEnum,
          description: "Defaults to what the weather (NOW) or the forecast (FORECAST) counts in.",
        }),
      },
      resolve: (team, args, context) =>
        rebalanceOf(context, team.id, args.horizon, args.weeks, args.metric),
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

// Mutations answer with a union: what they did, or one of the ways it can fail that a client is
// expected to handle. Each failure implements Error, so `... on Error { message }` covers any
// the client doesn't single out. Top-level `errors` are left for the unexpected.

interface Unauthorized {
  __typename: "Unauthorized";
  message: string;
}
interface LinearRateLimited {
  __typename: "LinearRateLimited";
  message: string;
  resetAt: string | null;
}
interface TeamNotFound {
  __typename: "TeamNotFound";
  message: string;
  teamId: string;
}
interface IssueNotFound {
  __typename: "IssueNotFound";
  message: string;
  issueId: string;
}
interface InvalidRules {
  __typename: "InvalidRules";
  message: string;
  problems: RuleProblem[];
}
interface UpdateRulesSuccess {
  __typename: "UpdateRulesSuccess";
  team: Team;
}
interface OverrideSuccess {
  __typename: "OverrideSuccess";
  issue: IssueModel;
  team: Team;
}
interface ReassignSuccess {
  __typename: "ReassignSuccess";
  issue: IssueModel;
  team: Team;
}

/** Every failure, so the Error interface resolves to whichever this is. */
type Failure = Unauthorized | LinearRateLimited | TeamNotFound | IssueNotFound | InvalidRules;

const ErrorRef = builder.interfaceRef<Failure>("Error").implement({
  description: "A mutation that didn't happen, and why, for showing the user.",
  resolveType: (failure) => failure.__typename,
  fields: (t) => ({ message: t.exposeString("message") }),
});

const UnauthorizedRef = builder.objectRef<Unauthorized>("Unauthorized").implement({
  description: "Not signed in, or the Linear session was revoked.",
  interfaces: [ErrorRef],
  fields: () => ({}),
});

const LinearRateLimitedRef = builder.objectRef<LinearRateLimited>("LinearRateLimited").implement({
  description: "Linear's rate limit is spent for now, so nothing was checked or changed.",
  interfaces: [ErrorRef],
  fields: (t) => ({
    resetAt: t.exposeString("resetAt", {
      nullable: true,
      description: "When Linear's budget is back in full (ISO 8601), if Linear said.",
    }),
  }),
});

const TeamNotFoundRef = builder.objectRef<TeamNotFound>("TeamNotFound").implement({
  description: "No team with this id that the viewer can see.",
  interfaces: [ErrorRef],
  fields: (t) => ({ teamId: t.exposeID("teamId") }),
});

const IssueNotFoundRef = builder.objectRef<IssueNotFound>("IssueNotFound").implement({
  description: "No issue with this id that the viewer can see.",
  interfaces: [ErrorRef],
  fields: (t) => ({ issueId: t.exposeID("issueId") }),
});

const RuleProblemRef = builder.objectRef<RuleProblem>("RuleProblem").implement({
  description: "One thing wrong with proposed rules.",
  fields: (t) => ({
    field: t.exposeString("field", { description: "The QuadrantRulesInput field at fault." }),
    message: t.exposeString("message"),
  }),
});

const InvalidRulesRef = builder.objectRef<InvalidRules>("InvalidRules").implement({
  description: "Rules the board couldn't sort by. Nothing was saved.",
  interfaces: [ErrorRef],
  fields: (t) => ({ problems: t.expose("problems", { type: [RuleProblemRef] }) }),
});

const UpdateRulesSuccessRef = builder
  .objectRef<UpdateRulesSuccess>("UpdateRulesSuccess")
  .implement({
    description:
      "The rules are saved. Everything derived from them, like each matrix, follows: ask for it here.",
    fields: (t) => ({ team: t.expose("team", { type: TeamRef }) }),
  });

const OverrideSuccessRef = builder.objectRef<OverrideSuccess>("OverrideSuccess").implement({
  description: "The issue is where it was asked to be: placed by hand, or back with the rules.",
  fields: (t) => ({
    issue: t.expose("issue", { type: IssueRef }),
    team: t.expose("team", { type: TeamRef, description: "The issue's team, for its matrices." }),
  }),
});

const ReassignSuccessRef = builder.objectRef<ReassignSuccess>("ReassignSuccess").implement({
  description:
    "The issue is someone else's in Linear now. Everything derived from who holds what, like each weather and forecast, follows: ask for it here.",
  fields: (t) => ({
    issue: t.expose("issue", { type: IssueRef }),
    team: t.expose("team", { type: TeamRef, description: "The issue's team, for its matrices." }),
  }),
});

const UpdateRulesResultRef = builder.unionType("UpdateRulesResult", {
  types: [
    UpdateRulesSuccessRef,
    InvalidRulesRef,
    TeamNotFoundRef,
    UnauthorizedRef,
    LinearRateLimitedRef,
  ],
  resolveType: (result) => result.__typename,
});

const OverrideResultRef = builder.unionType("OverrideResult", {
  types: [OverrideSuccessRef, IssueNotFoundRef, UnauthorizedRef, LinearRateLimitedRef],
  resolveType: (result) => result.__typename,
});

const ReassignResultRef = builder.unionType("ReassignResult", {
  types: [ReassignSuccessRef, IssueNotFoundRef, UnauthorizedRef, LinearRateLimitedRef],
  resolveType: (result) => result.__typename,
});

/**
 * Runs a mutation for a signed-in user or a demo visitor, turning the failures a client should handle into
 * results. Anything else still throws.
 */
async function attempt<T>(
  context: GraphQLContext,
  work: (workspace: Workspace) => Promise<T>,
): Promise<T | Unauthorized | LinearRateLimited> {
  const unauthorized = (message: string): Unauthorized => ({ __typename: "Unauthorized", message });
  const workspace = await context.workspace();
  if (!workspace) return unauthorized("Sign in with Linear first.");
  try {
    return await work(workspace);
  } catch (error) {
    if (error instanceof LinearAuthError) {
      return unauthorized("Linear rejected the session; sign in again.");
    }
    if (error instanceof LinearForbiddenError) {
      return unauthorized(
        "Linear won't let you change that. Sign in again to allow changes, or ask an admin of the team for access.",
      );
    }
    if (error instanceof LinearRateLimitError) {
      return {
        __typename: "LinearRateLimited",
        message: "Linear's rate limit is spent for now; try again later.",
        resetAt: error.resetAt === null ? null : new Date(error.resetAt).toISOString(),
      };
    }
    throw error;
  }
}

function issueNotFound(issueId: string): IssueNotFound {
  return {
    __typename: "IssueNotFound",
    message: "There's no such issue, or you can't see it.",
    issueId,
  };
}

/** Places an issue by hand, or with null hands it back to the rules. */
async function placeByHand(
  context: GraphQLContext,
  workspace: Workspace,
  issueId: string,
  quadrant: Quadrant | null,
): Promise<OverrideSuccess | IssueNotFound> {
  // Only issues the viewer can see, so nobody places issues in workspaces they aren't in.
  const issue = await workspace.issue(issueId);
  if (!issue) return issueNotFound(issueId);
  const [, rules] = await Promise.all([
    context.placements.setOverride(issue.id, quadrant),
    context.placements.rules(issue.team.id),
  ]);
  forgetWork(context);
  return {
    __typename: "OverrideSuccess",
    issue: place(issue, rules, context.today, quadrant ?? undefined),
    team: issue.team,
  };
}

/** Hands an issue to someone else in Linear. */
async function reassign(
  context: GraphQLContext,
  workspace: Workspace,
  issueId: string,
  userId: string,
): Promise<ReassignSuccess | IssueNotFound> {
  // Linear answers an issue the viewer can't see with an error, not a result to switch on.
  const before = await workspace.issue(issueId);
  if (!before) return issueNotFound(issueId);
  // Only to someone the board shows on the issue's team, so it lands on someone's matrix there.
  const { people } = await workspace.teamWork(before.team.id);
  if (!people.some((person) => person.id === userId)) {
    throw new GraphQLError(
      `There's nobody with that id on ${before.team.name} to hand ${before.identifier} to.`,
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }
  const issue = await workspace.reassign(issueId, userId);
  if (!issue) return issueNotFound(issueId);
  forgetWork(context);
  const [rules, overrides] = await Promise.all([
    context.placements.rules(issue.team.id),
    context.placements.overrides([issue]),
  ]);
  return {
    __typename: "ReassignSuccess",
    issue: place(issue, rules, context.today, overrides.get(issue.id)),
    team: issue.team,
  };
}

builder.mutationType({
  fields: (t) => ({
    updateQuadrantRules: t.field({
      type: UpdateRulesResultRef,
      description: "Replaces how a team sorts issues into quadrants.",
      args: {
        teamId: t.arg.id({ required: true }),
        input: t.arg({ type: QuadrantRulesInput, required: true }),
      },
      resolve: (_root, { teamId, input }, context) =>
        attempt(
          context,
          async (workspace): Promise<UpdateRulesSuccess | InvalidRules | TeamNotFound> => {
            const { rules, problems } = parseRules(input);
            if (problems) {
              return {
                __typename: "InvalidRules",
                message: problems.map((problem) => problem.message).join(" "),
                problems,
              };
            }
            const team = (await workspace.teams()).find(({ id }) => id === String(teamId));
            if (!team) {
              return {
                __typename: "TeamNotFound",
                message: "There's no such team, or you can't see it.",
                teamId: String(teamId),
              };
            }
            await context.placements.setRules(team.id, rules);
            forgetWork(context);
            return { __typename: "UpdateRulesSuccess", team };
          },
        ),
    }),
    overrideQuadrant: t.field({
      type: OverrideResultRef,
      description: "Puts an issue in a quadrant by hand. It stays there whatever the rules say.",
      args: {
        issueId: t.arg.id({ required: true }),
        quadrant: t.arg({ type: QuadrantEnum, required: true }),
      },
      resolve: (_root, { issueId, quadrant }, context) =>
        attempt(context, (workspace) => placeByHand(context, workspace, String(issueId), quadrant)),
    }),
    clearOverride: t.field({
      type: OverrideResultRef,
      description: "Hands an issue back to the rules. Fine on an issue never placed by hand.",
      args: { issueId: t.arg.id({ required: true }) },
      resolve: (_root, { issueId }, context) =>
        attempt(context, (workspace) => placeByHand(context, workspace, String(issueId), null)),
    }),
    reassignIssue: t.field({
      type: ReassignResultRef,
      description: "Hands an issue to someone else on its team, in Linear.",
      args: {
        issueId: t.arg.id({ required: true }),
        userId: t.arg.id({ required: true, description: "Who takes it." }),
      },
      resolve: (_root, { issueId, userId }, context) =>
        attempt(context, (workspace) =>
          reassign(context, workspace, String(issueId), String(userId)),
        ),
    }),
  }),
});

export const schema = builder.toSchema();
