// Our GraphQL schema: Linear's Issue, User and Team, extended with what the matrix derives
// from them (quadrant, placement reason, when an issue turns urgent, each person's matrix).

import SchemaBuilder from "@pothos/core";
import { GraphQLError } from "graphql";
import { statusTimeOff } from "./domain/away-status";
import { type BacklogRot, backlogRot } from "./domain/backlog";
import { parseCapacity } from "./domain/capacity";
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
  MAX_AWAY_STATUS_LENGTH,
  MAX_AWAY_STATUSES,
  MAX_URGENCY_WINDOW_DAYS,
  parseRules,
  type Quadrant,
  type QuadrantRules,
  type RuleProblem,
} from "./domain/quadrant";
import { type Horizon, rebalanceAhead, rebalanceNow, type Suggestion } from "./domain/rebalance";
import { MAX_TIME_OFF, parseTimeOff, staffingOn, type TimeOff, upcoming } from "./domain/time-off";
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

/**
 * Each of a team's people with their matrix, capacity and time off: what they added on the board,
 * and any away status of theirs the team lists.
 */
async function peopleMatrices(
  context: GraphQLContext,
  teamId: string,
): Promise<
  {
    person: Assignee;
    matrix: Matrix<TeamIssue>;
    capacity: number;
    timeOff: readonly TimeOff[];
  }[]
> {
  const [{ people }, { awayStatuses }] = await Promise.all([
    (await signedIn(context)).teamWork(teamId),
    context.placements.rules(teamId),
  ]);
  return Promise.all(
    people.map(async (person) => {
      const [matrix, capacity, added] = await Promise.all([
        teamMatrix(context, teamId, person.id),
        context.placements.capacity(person.id),
        context.placements.timeOff(person.id),
      ]);
      const status = statusTimeOff(person, awayStatuses, context.today);
      return { person, matrix, capacity, timeOff: status ? [...added, status] : added };
    }),
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
      people.map(({ person, matrix, capacity, timeOff }) => ({
        name: person.name,
        matrix,
        ...staffingOn(capacity, timeOff, context.today),
      })),
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
      people.map(({ person, matrix, capacity, timeOff }) => ({
        name: person.name,
        matrix,
        capacity,
        timeOff,
      })),
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
    // Work goes only to members: someone holding the team's issues from elsewhere may have left.
    const { memberIds } = await (await signedIn(context)).teamWork(teamId);
    return rebalanceNow(
      people.map(({ person, matrix, capacity, timeOff }) => ({
        ...person,
        teamId,
        matrix,
        capacity,
        timeOff,
        takesWork: memberIds.has(person.id),
      })),
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
  description:
    "How heavy urgent (Do + Delegate) load is, against a fair share of the team's: the team average, scaled by capacity.",
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
        "Can't tell: nothing urgent but some work has no due date; counting points with some urgent issue unestimated; or nobody else on the team to compare with. For a team, also when everyone is away.",
    },
    AWAY: {
      value: "away",
      description:
        "A person away all of the period (today, or a forecast week), whatever they hold: left out of the team's fair share. Any urgent work they still hold makes the team's weather a storm. Never a team's weather.",
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
  description:
    "The weather now: urgent (Do + Delegate) load against a fair share of the team's: the team average, scaled by capacity.",
  fields: (t) => ({
    kind: t.expose("kind", { type: WeatherKindEnum }),
    metric: t.expose("metric", { type: LoadMetricEnum }),
    load: t.exposeFloat("load", {
      nullable: true,
      description:
        "A person's urgent load; for a team, the load of whoever is busiest for their capacity, so compare it with teamAverage times their capacity, not teamAverage alone. Null when it can't be measured.",
    }),
    teamAverage: t.exposeFloat("teamAverage", {
      nullable: true,
      description:
        "The team's urgent load per full-time person: the load of everyone who could be measured, over their capacities added up. With everyone full time, the mean. A person's fair share is this times their capacity. Null when fewer than two could be measured: nobody to compare with.",
    }),
    overdue: t.exposeInt("overdue", {
      description:
        "Urgent (Do or Delegate) issues past their due date, which mean a storm whatever the load (unless they're away); for a team, everyone's.",
    }),
    reason: t.exposeString("reason", {
      description:
        'Why, e.g. "13 urgent points, 3.07× the team average; 2 issues overdue", "6 urgent issues at half time, 1.6× their share" or "Away until Nov 20, holding 3 urgent issues".',
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
    dropAlertPercent: t.exposeInt("dropAlertPercent", {
      description:
        "The team is flagged for backlog rot when more than this percent of its open issues are in Drop.",
    }),
    awayStatuses: t.exposeStringList("awayStatuses", {
      description:
        'Linear statuses that mean someone is away: an entry matches a status whose emoji it is, or whose label holds it, ignoring case, e.g. "🌴" or "vacation". Someone with one is away from today until the status clears (in their time zone), or for this week when it never does. Empty unless the team opts in.',
    }),
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
    dropAlertPercent: t.int({
      description:
        "Flag backlog rot when more than this percent of open issues are in Drop: 1 to 99. Left out, it stays as it was.",
    }),
    awayStatuses: t.stringList({
      description: `Linear statuses that mean someone is away: at most ${MAX_AWAY_STATUSES}, each at most ${MAX_AWAY_STATUS_LENGTH} characters. Trimmed, with blanks and repeats dropped. Left out, they stay as they were.`,
    }),
  }),
});

const BacklogRotRef = builder.objectRef<BacklogRot>("BacklogRot").implement({
  description:
    "How much of a team's open work sits in Drop (neither important nor urgent), against the team's alert.",
  fields: (t) => ({
    drop: t.exposeInt("drop", { description: "Open issues in Drop, assigned or not." }),
    total: t.exposeInt("total", { description: "All the team's open issues." }),
    share: t.exposeFloat("share", {
      description: "Drop's share of the open issues, 0 to 1. 0 when there are none.",
    }),
    alertPercent: t.exposeInt("alertPercent", { description: "The team's dropAlertPercent." }),
    rotting: t.exposeBoolean("rotting", {
      description: "More than alertPercent of the open issues are in Drop, as a whole percent.",
    }),
    reason: t.exposeString("reason", {
      description: `E.g. "12 of 20 open issues (60%) are in Drop, over the team's 40% alert".`,
    }),
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

const TimeOffRef = builder.objectRef<TimeOff>("TimeOff").implement({
  description: "A stretch of days someone is away, first and last day included.",
  fields: (t) => ({
    id: t.exposeID("id"),
    startsOn: t.expose("startsOn", { type: "Date" }),
    endsOn: t.expose("endsOn", { type: "Date" }),
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
      description:
        "Against that week's projected team average. Time off lowers a person's capacity by the working days they miss (capacity × days present / 5); off all five, they're AWAY.",
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
    capacity: t.float({
      description:
        "How much of a full-time week they work, more than 0 up to 1: 0.5 is half time. The same on every team. Weather compares their urgent load with the team average times this.",
      resolve: (user, _args, context) => context.placements.capacity(user.id),
    }),
    timeOff: t.field({
      type: [TimeOffRef],
      description: `Time off not over yet, soonest first: at most ${MAX_TIME_OFF}. The same on every team. Away all of today, their weather is AWAY; the forecast counts the working days they miss each week.`,
      resolve: async (user, _args, context) =>
        upcoming(await context.placements.timeOff(user.id), context.today),
    }),
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
    backlogRot: t.field({
      type: BacklogRotRef,
      description:
        "Whether too much of the team's open work, its people's and the unassigned, sits in Drop.",
      resolve: async (team, _args, context) => {
        const [people, unassigned, rules] = await Promise.all([
          peopleMatrices(context, team.id),
          teamMatrix(context, team.id, null),
          context.placements.rules(team.id),
        ]);
        const matrices = [...people.map(({ matrix }) => matrix), unassigned];
        return backlogRot(matrices.map(counts), rules.dropAlertPercent);
      },
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
        "Moves that bring everyone's urgent load within the weather's thresholds, in the order to make them. Urgent work held by someone away goes first, overdue or not. Then, greedy: the busiest person hands the least busy whichever issue leaves them closest, until nobody is under rain or in a storm by load. Otherwise overdue work stays put, nobody running late or away takes more, and only members of the team take work.",
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
interface UserNotFound {
  __typename: "UserNotFound";
  message: string;
  userId: string;
}
interface InvalidCapacity {
  __typename: "InvalidCapacity";
  message: string;
}
interface SetCapacitySuccess {
  __typename: "SetCapacitySuccess";
  user: UserModel;
  team: Team;
}
interface InvalidTimeOff {
  __typename: "InvalidTimeOff";
  message: string;
}
interface TimeOffNotFound {
  __typename: "TimeOffNotFound";
  message: string;
  timeOffId: string;
}
interface TimeOffSuccess {
  __typename: "TimeOffSuccess";
  user: UserModel;
  team: Team;
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
type Failure =
  | Unauthorized
  | LinearRateLimited
  | TeamNotFound
  | IssueNotFound
  | UserNotFound
  | InvalidRules
  | InvalidCapacity
  | InvalidTimeOff
  | TimeOffNotFound;

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

const UserNotFoundRef = builder.objectRef<UserNotFound>("UserNotFound").implement({
  description: "Nobody with this id on the team: not a member, and holding none of its issues.",
  interfaces: [ErrorRef],
  fields: (t) => ({ userId: t.exposeID("userId") }),
});

const InvalidCapacityRef = builder.objectRef<InvalidCapacity>("InvalidCapacity").implement({
  description: "A capacity that isn't more than 0 and at most 1. Nothing was saved.",
  interfaces: [ErrorRef],
  fields: () => ({}),
});

const SetCapacitySuccessRef = builder
  .objectRef<SetCapacitySuccess>("SetCapacitySuccess")
  .implement({
    description:
      "The capacity is saved. Everything weighed by it, like each weather, forecast and rebalance, follows: ask for it here.",
    fields: (t) => ({
      user: t.expose("user", { type: UserRef }),
      team: t.expose("team", {
        type: TeamRef,
        description: "The team asked about, for its board.",
      }),
    }),
  });

const InvalidTimeOffRef = builder.objectRef<InvalidTimeOff>("InvalidTimeOff").implement({
  description: `Time off that isn't real dates in order, is over already, covers more than a year (a month in the demo), or would give someone more than ${MAX_TIME_OFF} stretches coming up. Nothing was saved.`,
  interfaces: [ErrorRef],
  fields: () => ({}),
});

const TimeOffNotFoundRef = builder.objectRef<TimeOffNotFound>("TimeOffNotFound").implement({
  description: "No time off with this id for this person, perhaps removed already.",
  interfaces: [ErrorRef],
  fields: (t) => ({ timeOffId: t.exposeID("timeOffId") }),
});

const TimeOffSuccessRef = builder.objectRef<TimeOffSuccess>("TimeOffSuccess").implement({
  description:
    "Their time off is as asked. Everything weighed by it, like each weather, forecast and rebalance, follows: ask for it here.",
  fields: (t) => ({
    user: t.expose("user", { type: UserRef }),
    team: t.expose("team", { type: TeamRef, description: "The team asked about, for its board." }),
  }),
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

const SetCapacityResultRef = builder.unionType("SetCapacityResult", {
  types: [
    SetCapacitySuccessRef,
    InvalidCapacityRef,
    TeamNotFoundRef,
    UserNotFoundRef,
    UnauthorizedRef,
    LinearRateLimitedRef,
  ],
  resolveType: (result) => result.__typename,
});

const TimeOffResultRef = builder.unionType("TimeOffResult", {
  types: [
    TimeOffSuccessRef,
    InvalidTimeOffRef,
    TimeOffNotFoundRef,
    TeamNotFoundRef,
    UserNotFoundRef,
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

/** Sets how much of a full-time week someone on a team works. */
async function setCapacity(
  context: GraphQLContext,
  workspace: Workspace,
  teamId: string,
  userId: string,
  factor: number,
): Promise<SetCapacitySuccess | InvalidCapacity | TeamNotFound | UserNotFound> {
  const parsed = parseCapacity(factor);
  if ("problem" in parsed) return { __typename: "InvalidCapacity", message: parsed.problem };
  const found = await personOnTeam(workspace, teamId, userId);
  if ("__typename" in found) return found;
  const { team, person } = found;
  await context.placements.setCapacity(person.id, parsed.factor);
  forgetWork(context);
  return { __typename: "SetCapacitySuccess", user: { ...person, teamId: team.id }, team };
}

/**
 * Someone the viewer sees on a team: a member, or holding its issues. Only them, so nobody
 * changes anything for people in workspaces they aren't in.
 */
async function personOnTeam(
  workspace: Workspace,
  teamId: string,
  userId: string,
): Promise<{ team: Team; person: Assignee } | TeamNotFound | UserNotFound> {
  const team = (await workspace.teams()).find(({ id }) => id === teamId);
  if (!team) {
    return {
      __typename: "TeamNotFound",
      message: "There's no such team, or you can't see it.",
      teamId,
    };
  }
  const { people } = await workspace.teamWork(team.id);
  const person = people.find(({ id }) => id === userId);
  if (!person) {
    return {
      __typename: "UserNotFound",
      message: `There's nobody with that id on ${team.name}.`,
      userId,
    };
  }
  return { team, person };
}

/** Adds a stretch of time off for someone on a team. */
async function addTimeOff(
  context: GraphQLContext,
  workspace: Workspace,
  teamId: string,
  userId: string,
  startsOn: CalendarDate,
  endsOn: CalendarDate,
): Promise<TimeOffSuccess | InvalidTimeOff | TeamNotFound | UserNotFound> {
  const parsed = parseTimeOff(startsOn, endsOn, context.today, context.placements.maxTimeOffDays);
  if ("problem" in parsed) return { __typename: "InvalidTimeOff", message: parsed.problem };
  const found = await personOnTeam(workspace, teamId, userId);
  if ("__typename" in found) return found;
  const { team, person } = found;
  const added = await context.placements.addTimeOff(
    person.id,
    parsed.startsOn,
    parsed.endsOn,
    context.today,
  );
  if (!added) {
    return {
      __typename: "InvalidTimeOff",
      message: `${person.name} has ${MAX_TIME_OFF} stretches of time off coming up already; remove one first.`,
    };
  }
  forgetWork(context);
  return { __typename: "TimeOffSuccess", user: { ...person, teamId: team.id }, team };
}

/** Removes a stretch of someone's time off. */
async function removeTimeOff(
  context: GraphQLContext,
  workspace: Workspace,
  teamId: string,
  userId: string,
  timeOffId: string,
): Promise<TimeOffSuccess | TimeOffNotFound | TeamNotFound | UserNotFound> {
  const found = await personOnTeam(workspace, teamId, userId);
  if ("__typename" in found) return found;
  const { team, person } = found;
  if (!(await context.placements.removeTimeOff(person.id, timeOffId))) {
    return {
      __typename: "TimeOffNotFound",
      message: `${person.name} has no such time off; it may be gone already.`,
      timeOffId,
    };
  }
  forgetWork(context);
  return { __typename: "TimeOffSuccess", user: { ...person, teamId: team.id }, team };
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
  // Only to a member of the issue's team, as the board suggests: someone holding its issues from
  // elsewhere may have left, and Linear may not take them.
  const { memberIds } = await workspace.teamWork(before.team.id);
  if (!memberIds.has(userId)) {
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
            const saved = await context.placements.rules(String(teamId));
            const { rules, problems } = parseRules({
              ...input,
              dropAlertPercent: input.dropAlertPercent ?? saved.dropAlertPercent,
              awayStatuses: input.awayStatuses ?? saved.awayStatuses,
            });
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
    setCapacity: t.field({
      type: SetCapacityResultRef,
      description:
        "Sets how much of a full-time week someone works, on every team: 0.5 for half time, 1 for full time. Kept to hundredths.",
      args: {
        teamId: t.arg.id({
          required: true,
          description: "A team they're on or hold issues in, whose board to answer with.",
        }),
        userId: t.arg.id({ required: true }),
        factor: t.arg.float({ required: true, description: "More than 0, up to 1." }),
      },
      resolve: (_root, { teamId, userId, factor }, context) =>
        attempt(context, (workspace) =>
          setCapacity(context, workspace, String(teamId), String(userId), factor),
        ),
    }),
    addTimeOff: t.field({
      type: TimeOffResultRef,
      description:
        "Marks someone away from one day to another, both included, on every team. While they're away all of a day or forecast week, their weather is AWAY and their share of the urgent load goes to the others.",
      args: {
        teamId: t.arg.id({
          required: true,
          description: "A team they're on or hold issues in, whose board to answer with.",
        }),
        userId: t.arg.id({ required: true }),
        startsOn: t.arg({ type: "Date", required: true, description: "Their first day away." }),
        endsOn: t.arg({
          type: "Date",
          required: true,
          description: "Their last day away: no earlier than startsOn, and not over already.",
        }),
      },
      resolve: (_root, { teamId, userId, startsOn, endsOn }, context) =>
        attempt(context, (workspace) =>
          addTimeOff(context, workspace, String(teamId), String(userId), startsOn, endsOn),
        ),
    }),
    removeTimeOff: t.field({
      type: TimeOffResultRef,
      description: "Takes back a stretch of someone's time off.",
      args: {
        teamId: t.arg.id({
          required: true,
          description: "A team they're on or hold issues in, whose board to answer with.",
        }),
        userId: t.arg.id({ required: true }),
        timeOffId: t.arg.id({ required: true }),
      },
      resolve: (_root, { teamId, userId, timeOffId }, context) =>
        attempt(context, (workspace) =>
          removeTimeOff(context, workspace, String(teamId), String(userId), String(timeOffId)),
        ),
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
