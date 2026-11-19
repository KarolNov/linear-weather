/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
/** Where issues without a due date land. */
export type NoDueDate =
  | 'NOT_URGENT'
  | 'URGENT';

/** An Eisenhower quadrant. */
export type Quadrant =
  /** Urgent, less important. */
  | 'DELEGATE'
  /** Important and urgent. */
  | 'DO'
  /** Neither: question it. */
  | 'DROP'
  /** Important, not urgent yet. */
  | 'SCHEDULE';

/** A QuadrantRulesInput field that can be at fault. */
export type QuadrantRulesField =
  | 'awayStatuses'
  | 'dropAlertPercent'
  | 'importantFrom'
  | 'urgencyWindowDays';

/** A team's new rules, all of them: the ones left as they were included. */
export type QuadrantRulesInput = {
  /** Linear statuses that mean someone is away: at most 10, each at most 40 characters. Trimmed, with blanks and repeats dropped. Left out, they stay as they were. */
  awayStatuses?: Array<string> | null | undefined;
  /** Count an issue that blocks another, still open, as important whatever its priority. Left out, it stays as it was. */
  blockersAreImportant?: boolean | null | undefined;
  /** Count an issue in its team's current cycle as urgent whatever its due date. Left out, it stays as it was. */
  currentCycleIsUrgent?: boolean | null | undefined;
  /** Flag backlog rot when more than this percent of open issues are in Drop: 1 to 99. Left out, it stays as it was. */
  dropAlertPercent?: number | null | undefined;
  /** Lowest Linear priority that still counts as important: 1 Urgent … 4 Low. */
  importantFrom: number;
  noDueDate: NoDueDate;
  /** Urgent when due in fewer than this many days, or overdue: 1 to 365. */
  urgencyWindowDays: number;
};

/** What put an issue in its quadrant. */
export type QuadrantSource =
  /** A PM, by hand. */
  | 'OVERRIDE'
  /** The team's rules. */
  | 'RULE';

/** How heavy urgent (Do + Delegate) load is, against a fair share of the team's: the team average, scaled by capacity. */
export type WeatherKind =
  /** A person away all of the period (today, or a forecast week), whatever they hold: left out of the team's fair share. Any urgent work they still hold makes the team's weather a storm. Never a team's weather. */
  | 'AWAY'
  /** Around average. */
  | 'CLOUDY'
  /** Can't tell: nothing urgent but some work has no due date; counting points with some urgent issue unestimated; or nobody else on the team to compare with. For a team, also when everyone is away. */
  | 'FOG'
  /** Noticeably above average (over 1.25×). */
  | 'RAIN'
  /** Far above average (over 1.5×), or urgent issues overdue. */
  | 'STORM'
  /** Nothing urgent, or under 0.75× the average: room for more. */
  | 'SUNNY';

export type BoardQueryVariables = Exact<{
  teamId?: string | null | undefined;
}>;


export type BoardQuery = { today: string, viewer: { name: string, avatarUrl: string | null, organization: { name: string } } | null, teams: Array<{ id: string, name: string, key: string }> | null, team: { id: string, name: string, key: string, rules: { importantFrom: number, urgencyWindowDays: number, noDueDate: NoDueDate, dropAlertPercent: number, awayStatuses: Array<string>, blockersAreImportant: boolean, currentCycleIsUrgent: boolean }, weather: { kind: WeatherKind, reason: string }, backlogRot: { rotting: boolean, reason: string }, rebalanceNow: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, rebalanceForecast: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, people: Array<{ id: string, name: string, avatarUrl: string | null, capacity: number, timeOff: Array<{ id: string, startsOn: string, endsOn: string }>, weather: { kind: WeatherKind, reason: string, overdue: number } | null, forecast: Array<{ startsOn: string, endsOn: string, summary: string, weather: { kind: WeatherKind, reason: string }, turningUrgent: Array<{ identifier: string }> }> | null, matrix: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } | null }>, unassigned: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } } | null };

export type TeamBoardFragment = { id: string, name: string, key: string, rules: { importantFrom: number, urgencyWindowDays: number, noDueDate: NoDueDate, dropAlertPercent: number, awayStatuses: Array<string>, blockersAreImportant: boolean, currentCycleIsUrgent: boolean }, weather: { kind: WeatherKind, reason: string }, backlogRot: { rotting: boolean, reason: string }, rebalanceNow: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, rebalanceForecast: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, people: Array<{ id: string, name: string, avatarUrl: string | null, capacity: number, timeOff: Array<{ id: string, startsOn: string, endsOn: string }>, weather: { kind: WeatherKind, reason: string, overdue: number } | null, forecast: Array<{ startsOn: string, endsOn: string, summary: string, weather: { kind: WeatherKind, reason: string }, turningUrgent: Array<{ identifier: string }> }> | null, matrix: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } | null }>, unassigned: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } };

export type MatrixFragment = { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> };

export type SuggestionFragment = { week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } };

export type BoardIssueFragment = { id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } };

export type TeamWeatherSubscriptionVariables = Exact<{
  teamId: string;
}>;


export type TeamWeatherSubscription = { teamWeatherUpdated: { today: string, team: { id: string, name: string, key: string, rules: { importantFrom: number, urgencyWindowDays: number, noDueDate: NoDueDate, dropAlertPercent: number, awayStatuses: Array<string>, blockersAreImportant: boolean, currentCycleIsUrgent: boolean }, weather: { kind: WeatherKind, reason: string }, backlogRot: { rotting: boolean, reason: string }, rebalanceNow: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, rebalanceForecast: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, people: Array<{ id: string, name: string, avatarUrl: string | null, capacity: number, timeOff: Array<{ id: string, startsOn: string, endsOn: string }>, weather: { kind: WeatherKind, reason: string, overdue: number } | null, forecast: Array<{ startsOn: string, endsOn: string, summary: string, weather: { kind: WeatherKind, reason: string }, turningUrgent: Array<{ identifier: string }> }> | null, matrix: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } | null }>, unassigned: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } } | null } };

export type UpdateRulesMutationVariables = Exact<{
  teamId: string;
  input: QuadrantRulesInput;
}>;


export type UpdateRulesMutation = { updateQuadrantRules:
    | { __typename: 'InvalidRules', message: string, problems: Array<{ field: QuadrantRulesField, message: string }> }
    | { __typename: 'LinearRateLimited', message: string }
    | { __typename: 'TeamNotFound', message: string }
    | { __typename: 'Unauthorized', message: string }
    | { __typename: 'UpdateRulesSuccess', team: { id: string, name: string, key: string, rules: { importantFrom: number, urgencyWindowDays: number, noDueDate: NoDueDate, dropAlertPercent: number, awayStatuses: Array<string>, blockersAreImportant: boolean, currentCycleIsUrgent: boolean }, weather: { kind: WeatherKind, reason: string }, backlogRot: { rotting: boolean, reason: string }, rebalanceNow: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, rebalanceForecast: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, people: Array<{ id: string, name: string, avatarUrl: string | null, capacity: number, timeOff: Array<{ id: string, startsOn: string, endsOn: string }>, weather: { kind: WeatherKind, reason: string, overdue: number } | null, forecast: Array<{ startsOn: string, endsOn: string, summary: string, weather: { kind: WeatherKind, reason: string }, turningUrgent: Array<{ identifier: string }> }> | null, matrix: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } | null }>, unassigned: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } } }
   };

export type OverrideQuadrantMutationVariables = Exact<{
  issueId: string;
  quadrant: Quadrant;
}>;


export type OverrideQuadrantMutation = { overrideQuadrant:
    | { __typename: 'IssueNotFound', message: string }
    | { __typename: 'LinearRateLimited', message: string }
    | { __typename: 'OverrideSuccess', team: { id: string, name: string, key: string, rules: { importantFrom: number, urgencyWindowDays: number, noDueDate: NoDueDate, dropAlertPercent: number, awayStatuses: Array<string>, blockersAreImportant: boolean, currentCycleIsUrgent: boolean }, weather: { kind: WeatherKind, reason: string }, backlogRot: { rotting: boolean, reason: string }, rebalanceNow: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, rebalanceForecast: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, people: Array<{ id: string, name: string, avatarUrl: string | null, capacity: number, timeOff: Array<{ id: string, startsOn: string, endsOn: string }>, weather: { kind: WeatherKind, reason: string, overdue: number } | null, forecast: Array<{ startsOn: string, endsOn: string, summary: string, weather: { kind: WeatherKind, reason: string }, turningUrgent: Array<{ identifier: string }> }> | null, matrix: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } | null }>, unassigned: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } } }
    | { __typename: 'Unauthorized', message: string }
   };

export type ClearOverrideMutationVariables = Exact<{
  issueId: string;
}>;


export type ClearOverrideMutation = { clearOverride:
    | { __typename: 'IssueNotFound', message: string }
    | { __typename: 'LinearRateLimited', message: string }
    | { __typename: 'OverrideSuccess', team: { id: string, name: string, key: string, rules: { importantFrom: number, urgencyWindowDays: number, noDueDate: NoDueDate, dropAlertPercent: number, awayStatuses: Array<string>, blockersAreImportant: boolean, currentCycleIsUrgent: boolean }, weather: { kind: WeatherKind, reason: string }, backlogRot: { rotting: boolean, reason: string }, rebalanceNow: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, rebalanceForecast: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, people: Array<{ id: string, name: string, avatarUrl: string | null, capacity: number, timeOff: Array<{ id: string, startsOn: string, endsOn: string }>, weather: { kind: WeatherKind, reason: string, overdue: number } | null, forecast: Array<{ startsOn: string, endsOn: string, summary: string, weather: { kind: WeatherKind, reason: string }, turningUrgent: Array<{ identifier: string }> }> | null, matrix: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } | null }>, unassigned: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } } }
    | { __typename: 'Unauthorized', message: string }
   };

export type ReassignIssueMutationVariables = Exact<{
  issueId: string;
  userId: string;
}>;


export type ReassignIssueMutation = { reassignIssue:
    | { __typename: 'IssueNotFound', message: string }
    | { __typename: 'LinearRateLimited', message: string }
    | { __typename: 'ReassignSuccess', team: { id: string, name: string, key: string, rules: { importantFrom: number, urgencyWindowDays: number, noDueDate: NoDueDate, dropAlertPercent: number, awayStatuses: Array<string>, blockersAreImportant: boolean, currentCycleIsUrgent: boolean }, weather: { kind: WeatherKind, reason: string }, backlogRot: { rotting: boolean, reason: string }, rebalanceNow: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, rebalanceForecast: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, people: Array<{ id: string, name: string, avatarUrl: string | null, capacity: number, timeOff: Array<{ id: string, startsOn: string, endsOn: string }>, weather: { kind: WeatherKind, reason: string, overdue: number } | null, forecast: Array<{ startsOn: string, endsOn: string, summary: string, weather: { kind: WeatherKind, reason: string }, turningUrgent: Array<{ identifier: string }> }> | null, matrix: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } | null }>, unassigned: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } } }
    | { __typename: 'Unauthorized', message: string }
   };

export type SetCapacityMutationVariables = Exact<{
  teamId: string;
  userId: string;
  factor: number;
}>;


export type SetCapacityMutation = { setCapacity:
    | { __typename: 'InvalidCapacity', message: string }
    | { __typename: 'LinearRateLimited', message: string }
    | { __typename: 'SetCapacitySuccess', team: { id: string, name: string, key: string, rules: { importantFrom: number, urgencyWindowDays: number, noDueDate: NoDueDate, dropAlertPercent: number, awayStatuses: Array<string>, blockersAreImportant: boolean, currentCycleIsUrgent: boolean }, weather: { kind: WeatherKind, reason: string }, backlogRot: { rotting: boolean, reason: string }, rebalanceNow: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, rebalanceForecast: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, people: Array<{ id: string, name: string, avatarUrl: string | null, capacity: number, timeOff: Array<{ id: string, startsOn: string, endsOn: string }>, weather: { kind: WeatherKind, reason: string, overdue: number } | null, forecast: Array<{ startsOn: string, endsOn: string, summary: string, weather: { kind: WeatherKind, reason: string }, turningUrgent: Array<{ identifier: string }> }> | null, matrix: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } | null }>, unassigned: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } } }
    | { __typename: 'TeamNotFound', message: string }
    | { __typename: 'Unauthorized', message: string }
    | { __typename: 'UserNotFound', message: string }
   };

export type AddTimeOffMutationVariables = Exact<{
  teamId: string;
  userId: string;
  startsOn: string;
  endsOn: string;
}>;


export type AddTimeOffMutation = { addTimeOff:
    | { __typename: 'InvalidTimeOff', message: string }
    | { __typename: 'LinearRateLimited', message: string }
    | { __typename: 'TeamNotFound', message: string }
    | { __typename: 'TimeOffNotFound', message: string }
    | { __typename: 'TimeOffSuccess', team: { id: string, name: string, key: string, rules: { importantFrom: number, urgencyWindowDays: number, noDueDate: NoDueDate, dropAlertPercent: number, awayStatuses: Array<string>, blockersAreImportant: boolean, currentCycleIsUrgent: boolean }, weather: { kind: WeatherKind, reason: string }, backlogRot: { rotting: boolean, reason: string }, rebalanceNow: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, rebalanceForecast: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, people: Array<{ id: string, name: string, avatarUrl: string | null, capacity: number, timeOff: Array<{ id: string, startsOn: string, endsOn: string }>, weather: { kind: WeatherKind, reason: string, overdue: number } | null, forecast: Array<{ startsOn: string, endsOn: string, summary: string, weather: { kind: WeatherKind, reason: string }, turningUrgent: Array<{ identifier: string }> }> | null, matrix: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } | null }>, unassigned: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } } }
    | { __typename: 'Unauthorized', message: string }
    | { __typename: 'UserNotFound', message: string }
   };

export type RemoveTimeOffMutationVariables = Exact<{
  teamId: string;
  userId: string;
  timeOffId: string;
}>;


export type RemoveTimeOffMutation = { removeTimeOff:
    | { __typename: 'InvalidTimeOff', message: string }
    | { __typename: 'LinearRateLimited', message: string }
    | { __typename: 'TeamNotFound', message: string }
    | { __typename: 'TimeOffNotFound', message: string }
    | { __typename: 'TimeOffSuccess', team: { id: string, name: string, key: string, rules: { importantFrom: number, urgencyWindowDays: number, noDueDate: NoDueDate, dropAlertPercent: number, awayStatuses: Array<string>, blockersAreImportant: boolean, currentCycleIsUrgent: boolean }, weather: { kind: WeatherKind, reason: string }, backlogRot: { rotting: boolean, reason: string }, rebalanceNow: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, rebalanceForecast: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, people: Array<{ id: string, name: string, avatarUrl: string | null, capacity: number, timeOff: Array<{ id: string, startsOn: string, endsOn: string }>, weather: { kind: WeatherKind, reason: string, overdue: number } | null, forecast: Array<{ startsOn: string, endsOn: string, summary: string, weather: { kind: WeatherKind, reason: string }, turningUrgent: Array<{ identifier: string }> }> | null, matrix: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } | null }>, unassigned: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } } }
    | { __typename: 'Unauthorized', message: string }
    | { __typename: 'UserNotFound', message: string }
   };

export type TeamQueryVariables = Exact<{
  teamId: string;
}>;


export type TeamQuery = { team: { id: string, name: string, key: string, rules: { importantFrom: number, urgencyWindowDays: number, noDueDate: NoDueDate, dropAlertPercent: number, awayStatuses: Array<string>, blockersAreImportant: boolean, currentCycleIsUrgent: boolean }, weather: { kind: WeatherKind, reason: string }, backlogRot: { rotting: boolean, reason: string }, rebalanceNow: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, rebalanceForecast: Array<{ week: number | null, toWeather: WeatherKind, reason: string, issue: { id: string, identifier: string, title: string, url: string, quadrant: Quadrant, becomesUrgentOn: string | null }, from: { id: string, name: string, avatarUrl: string | null }, to: { id: string, name: string, avatarUrl: string | null } }>, people: Array<{ id: string, name: string, avatarUrl: string | null, capacity: number, timeOff: Array<{ id: string, startsOn: string, endsOn: string }>, weather: { kind: WeatherKind, reason: string, overdue: number } | null, forecast: Array<{ startsOn: string, endsOn: string, summary: string, weather: { kind: WeatherKind, reason: string }, turningUrgent: Array<{ identifier: string }> }> | null, matrix: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } | null }>, unassigned: { counts: { do: number, schedule: number, delegate: number, drop: number }, do: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, schedule: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, delegate: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }>, drop: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, quadrantSource: QuadrantSource, placementReason: string, state: { name: string } }> } } | null };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}
export const SuggestionFragmentDoc = /*#__PURE__*/ new TypedDocumentString(`
    fragment Suggestion on Suggestion {
  issue {
    id
    identifier
    title
    url
    quadrant
    becomesUrgentOn
  }
  from {
    id
    name
    avatarUrl
  }
  to {
    id
    name
    avatarUrl
  }
  week
  toWeather
  reason
}
    `, {"fragmentName":"Suggestion"}) as unknown as TypedDocumentString<SuggestionFragment, unknown>;
export const BoardIssueFragmentDoc = /*#__PURE__*/ new TypedDocumentString(`
    fragment BoardIssue on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  state {
    name
  }
  quadrantSource
  placementReason
}
    `, {"fragmentName":"BoardIssue"}) as unknown as TypedDocumentString<BoardIssueFragment, unknown>;
export const MatrixFragmentDoc = /*#__PURE__*/ new TypedDocumentString(`
    fragment Matrix on Matrix {
  counts {
    do
    schedule
    delegate
    drop
  }
  do {
    ...BoardIssue
  }
  schedule {
    ...BoardIssue
  }
  delegate {
    ...BoardIssue
  }
  drop {
    ...BoardIssue
  }
}
    fragment BoardIssue on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  state {
    name
  }
  quadrantSource
  placementReason
}`, {"fragmentName":"Matrix"}) as unknown as TypedDocumentString<MatrixFragment, unknown>;
export const TeamBoardFragmentDoc = /*#__PURE__*/ new TypedDocumentString(`
    fragment TeamBoard on Team {
  id
  name
  key
  rules {
    importantFrom
    urgencyWindowDays
    noDueDate
    dropAlertPercent
    awayStatuses
    blockersAreImportant
    currentCycleIsUrgent
  }
  weather {
    kind
    reason
  }
  backlogRot {
    rotting
    reason
  }
  rebalanceNow: rebalanceSuggestions(horizon: NOW) {
    ...Suggestion
  }
  rebalanceForecast: rebalanceSuggestions(horizon: FORECAST) {
    ...Suggestion
  }
  people {
    id
    name
    avatarUrl
    capacity
    timeOff {
      id
      startsOn
      endsOn
    }
    weather {
      kind
      reason
      overdue
    }
    forecast {
      startsOn
      endsOn
      weather {
        kind
        reason
      }
      summary
      turningUrgent {
        identifier
      }
    }
    matrix {
      ...Matrix
    }
  }
  unassigned {
    ...Matrix
  }
}
    fragment Matrix on Matrix {
  counts {
    do
    schedule
    delegate
    drop
  }
  do {
    ...BoardIssue
  }
  schedule {
    ...BoardIssue
  }
  delegate {
    ...BoardIssue
  }
  drop {
    ...BoardIssue
  }
}
fragment Suggestion on Suggestion {
  issue {
    id
    identifier
    title
    url
    quadrant
    becomesUrgentOn
  }
  from {
    id
    name
    avatarUrl
  }
  to {
    id
    name
    avatarUrl
  }
  week
  toWeather
  reason
}
fragment BoardIssue on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  state {
    name
  }
  quadrantSource
  placementReason
}`, {"fragmentName":"TeamBoard"}) as unknown as TypedDocumentString<TeamBoardFragment, unknown>;
export const BoardDocument = /*#__PURE__*/ new TypedDocumentString(`
    query Board($teamId: ID) {
  today
  viewer {
    name
    avatarUrl
    organization {
      name
    }
  }
  teams {
    id
    name
    key
  }
  team(id: $teamId) {
    ...TeamBoard
  }
}
    fragment TeamBoard on Team {
  id
  name
  key
  rules {
    importantFrom
    urgencyWindowDays
    noDueDate
    dropAlertPercent
    awayStatuses
    blockersAreImportant
    currentCycleIsUrgent
  }
  weather {
    kind
    reason
  }
  backlogRot {
    rotting
    reason
  }
  rebalanceNow: rebalanceSuggestions(horizon: NOW) {
    ...Suggestion
  }
  rebalanceForecast: rebalanceSuggestions(horizon: FORECAST) {
    ...Suggestion
  }
  people {
    id
    name
    avatarUrl
    capacity
    timeOff {
      id
      startsOn
      endsOn
    }
    weather {
      kind
      reason
      overdue
    }
    forecast {
      startsOn
      endsOn
      weather {
        kind
        reason
      }
      summary
      turningUrgent {
        identifier
      }
    }
    matrix {
      ...Matrix
    }
  }
  unassigned {
    ...Matrix
  }
}
fragment Matrix on Matrix {
  counts {
    do
    schedule
    delegate
    drop
  }
  do {
    ...BoardIssue
  }
  schedule {
    ...BoardIssue
  }
  delegate {
    ...BoardIssue
  }
  drop {
    ...BoardIssue
  }
}
fragment Suggestion on Suggestion {
  issue {
    id
    identifier
    title
    url
    quadrant
    becomesUrgentOn
  }
  from {
    id
    name
    avatarUrl
  }
  to {
    id
    name
    avatarUrl
  }
  week
  toWeather
  reason
}
fragment BoardIssue on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  state {
    name
  }
  quadrantSource
  placementReason
}`) as unknown as TypedDocumentString<BoardQuery, BoardQueryVariables>;
export const TeamWeatherDocument = /*#__PURE__*/ new TypedDocumentString(`
    subscription TeamWeather($teamId: ID!) {
  teamWeatherUpdated(teamId: $teamId) {
    today
    team {
      ...TeamBoard
    }
  }
}
    fragment TeamBoard on Team {
  id
  name
  key
  rules {
    importantFrom
    urgencyWindowDays
    noDueDate
    dropAlertPercent
    awayStatuses
    blockersAreImportant
    currentCycleIsUrgent
  }
  weather {
    kind
    reason
  }
  backlogRot {
    rotting
    reason
  }
  rebalanceNow: rebalanceSuggestions(horizon: NOW) {
    ...Suggestion
  }
  rebalanceForecast: rebalanceSuggestions(horizon: FORECAST) {
    ...Suggestion
  }
  people {
    id
    name
    avatarUrl
    capacity
    timeOff {
      id
      startsOn
      endsOn
    }
    weather {
      kind
      reason
      overdue
    }
    forecast {
      startsOn
      endsOn
      weather {
        kind
        reason
      }
      summary
      turningUrgent {
        identifier
      }
    }
    matrix {
      ...Matrix
    }
  }
  unassigned {
    ...Matrix
  }
}
fragment Matrix on Matrix {
  counts {
    do
    schedule
    delegate
    drop
  }
  do {
    ...BoardIssue
  }
  schedule {
    ...BoardIssue
  }
  delegate {
    ...BoardIssue
  }
  drop {
    ...BoardIssue
  }
}
fragment Suggestion on Suggestion {
  issue {
    id
    identifier
    title
    url
    quadrant
    becomesUrgentOn
  }
  from {
    id
    name
    avatarUrl
  }
  to {
    id
    name
    avatarUrl
  }
  week
  toWeather
  reason
}
fragment BoardIssue on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  state {
    name
  }
  quadrantSource
  placementReason
}`) as unknown as TypedDocumentString<TeamWeatherSubscription, TeamWeatherSubscriptionVariables>;
export const UpdateRulesDocument = /*#__PURE__*/ new TypedDocumentString(`
    mutation UpdateRules($teamId: ID!, $input: QuadrantRulesInput!) {
  updateQuadrantRules(teamId: $teamId, input: $input) {
    __typename
    ... on Error {
      message
    }
    ... on InvalidRules {
      problems {
        field
        message
      }
    }
    ... on UpdateRulesSuccess {
      team {
        ...TeamBoard
      }
    }
  }
}
    fragment TeamBoard on Team {
  id
  name
  key
  rules {
    importantFrom
    urgencyWindowDays
    noDueDate
    dropAlertPercent
    awayStatuses
    blockersAreImportant
    currentCycleIsUrgent
  }
  weather {
    kind
    reason
  }
  backlogRot {
    rotting
    reason
  }
  rebalanceNow: rebalanceSuggestions(horizon: NOW) {
    ...Suggestion
  }
  rebalanceForecast: rebalanceSuggestions(horizon: FORECAST) {
    ...Suggestion
  }
  people {
    id
    name
    avatarUrl
    capacity
    timeOff {
      id
      startsOn
      endsOn
    }
    weather {
      kind
      reason
      overdue
    }
    forecast {
      startsOn
      endsOn
      weather {
        kind
        reason
      }
      summary
      turningUrgent {
        identifier
      }
    }
    matrix {
      ...Matrix
    }
  }
  unassigned {
    ...Matrix
  }
}
fragment Matrix on Matrix {
  counts {
    do
    schedule
    delegate
    drop
  }
  do {
    ...BoardIssue
  }
  schedule {
    ...BoardIssue
  }
  delegate {
    ...BoardIssue
  }
  drop {
    ...BoardIssue
  }
}
fragment Suggestion on Suggestion {
  issue {
    id
    identifier
    title
    url
    quadrant
    becomesUrgentOn
  }
  from {
    id
    name
    avatarUrl
  }
  to {
    id
    name
    avatarUrl
  }
  week
  toWeather
  reason
}
fragment BoardIssue on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  state {
    name
  }
  quadrantSource
  placementReason
}`) as unknown as TypedDocumentString<UpdateRulesMutation, UpdateRulesMutationVariables>;
export const OverrideQuadrantDocument = /*#__PURE__*/ new TypedDocumentString(`
    mutation OverrideQuadrant($issueId: ID!, $quadrant: Quadrant!) {
  overrideQuadrant(issueId: $issueId, quadrant: $quadrant) {
    __typename
    ... on Error {
      message
    }
    ... on OverrideSuccess {
      team {
        ...TeamBoard
      }
    }
  }
}
    fragment TeamBoard on Team {
  id
  name
  key
  rules {
    importantFrom
    urgencyWindowDays
    noDueDate
    dropAlertPercent
    awayStatuses
    blockersAreImportant
    currentCycleIsUrgent
  }
  weather {
    kind
    reason
  }
  backlogRot {
    rotting
    reason
  }
  rebalanceNow: rebalanceSuggestions(horizon: NOW) {
    ...Suggestion
  }
  rebalanceForecast: rebalanceSuggestions(horizon: FORECAST) {
    ...Suggestion
  }
  people {
    id
    name
    avatarUrl
    capacity
    timeOff {
      id
      startsOn
      endsOn
    }
    weather {
      kind
      reason
      overdue
    }
    forecast {
      startsOn
      endsOn
      weather {
        kind
        reason
      }
      summary
      turningUrgent {
        identifier
      }
    }
    matrix {
      ...Matrix
    }
  }
  unassigned {
    ...Matrix
  }
}
fragment Matrix on Matrix {
  counts {
    do
    schedule
    delegate
    drop
  }
  do {
    ...BoardIssue
  }
  schedule {
    ...BoardIssue
  }
  delegate {
    ...BoardIssue
  }
  drop {
    ...BoardIssue
  }
}
fragment Suggestion on Suggestion {
  issue {
    id
    identifier
    title
    url
    quadrant
    becomesUrgentOn
  }
  from {
    id
    name
    avatarUrl
  }
  to {
    id
    name
    avatarUrl
  }
  week
  toWeather
  reason
}
fragment BoardIssue on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  state {
    name
  }
  quadrantSource
  placementReason
}`) as unknown as TypedDocumentString<OverrideQuadrantMutation, OverrideQuadrantMutationVariables>;
export const ClearOverrideDocument = /*#__PURE__*/ new TypedDocumentString(`
    mutation ClearOverride($issueId: ID!) {
  clearOverride(issueId: $issueId) {
    __typename
    ... on Error {
      message
    }
    ... on OverrideSuccess {
      team {
        ...TeamBoard
      }
    }
  }
}
    fragment TeamBoard on Team {
  id
  name
  key
  rules {
    importantFrom
    urgencyWindowDays
    noDueDate
    dropAlertPercent
    awayStatuses
    blockersAreImportant
    currentCycleIsUrgent
  }
  weather {
    kind
    reason
  }
  backlogRot {
    rotting
    reason
  }
  rebalanceNow: rebalanceSuggestions(horizon: NOW) {
    ...Suggestion
  }
  rebalanceForecast: rebalanceSuggestions(horizon: FORECAST) {
    ...Suggestion
  }
  people {
    id
    name
    avatarUrl
    capacity
    timeOff {
      id
      startsOn
      endsOn
    }
    weather {
      kind
      reason
      overdue
    }
    forecast {
      startsOn
      endsOn
      weather {
        kind
        reason
      }
      summary
      turningUrgent {
        identifier
      }
    }
    matrix {
      ...Matrix
    }
  }
  unassigned {
    ...Matrix
  }
}
fragment Matrix on Matrix {
  counts {
    do
    schedule
    delegate
    drop
  }
  do {
    ...BoardIssue
  }
  schedule {
    ...BoardIssue
  }
  delegate {
    ...BoardIssue
  }
  drop {
    ...BoardIssue
  }
}
fragment Suggestion on Suggestion {
  issue {
    id
    identifier
    title
    url
    quadrant
    becomesUrgentOn
  }
  from {
    id
    name
    avatarUrl
  }
  to {
    id
    name
    avatarUrl
  }
  week
  toWeather
  reason
}
fragment BoardIssue on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  state {
    name
  }
  quadrantSource
  placementReason
}`) as unknown as TypedDocumentString<ClearOverrideMutation, ClearOverrideMutationVariables>;
export const ReassignIssueDocument = /*#__PURE__*/ new TypedDocumentString(`
    mutation ReassignIssue($issueId: ID!, $userId: ID!) {
  reassignIssue(issueId: $issueId, userId: $userId) {
    __typename
    ... on Error {
      message
    }
    ... on ReassignSuccess {
      team {
        ...TeamBoard
      }
    }
  }
}
    fragment TeamBoard on Team {
  id
  name
  key
  rules {
    importantFrom
    urgencyWindowDays
    noDueDate
    dropAlertPercent
    awayStatuses
    blockersAreImportant
    currentCycleIsUrgent
  }
  weather {
    kind
    reason
  }
  backlogRot {
    rotting
    reason
  }
  rebalanceNow: rebalanceSuggestions(horizon: NOW) {
    ...Suggestion
  }
  rebalanceForecast: rebalanceSuggestions(horizon: FORECAST) {
    ...Suggestion
  }
  people {
    id
    name
    avatarUrl
    capacity
    timeOff {
      id
      startsOn
      endsOn
    }
    weather {
      kind
      reason
      overdue
    }
    forecast {
      startsOn
      endsOn
      weather {
        kind
        reason
      }
      summary
      turningUrgent {
        identifier
      }
    }
    matrix {
      ...Matrix
    }
  }
  unassigned {
    ...Matrix
  }
}
fragment Matrix on Matrix {
  counts {
    do
    schedule
    delegate
    drop
  }
  do {
    ...BoardIssue
  }
  schedule {
    ...BoardIssue
  }
  delegate {
    ...BoardIssue
  }
  drop {
    ...BoardIssue
  }
}
fragment Suggestion on Suggestion {
  issue {
    id
    identifier
    title
    url
    quadrant
    becomesUrgentOn
  }
  from {
    id
    name
    avatarUrl
  }
  to {
    id
    name
    avatarUrl
  }
  week
  toWeather
  reason
}
fragment BoardIssue on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  state {
    name
  }
  quadrantSource
  placementReason
}`) as unknown as TypedDocumentString<ReassignIssueMutation, ReassignIssueMutationVariables>;
export const SetCapacityDocument = /*#__PURE__*/ new TypedDocumentString(`
    mutation SetCapacity($teamId: ID!, $userId: ID!, $factor: Float!) {
  setCapacity(teamId: $teamId, userId: $userId, factor: $factor) {
    __typename
    ... on Error {
      message
    }
    ... on SetCapacitySuccess {
      team {
        ...TeamBoard
      }
    }
  }
}
    fragment TeamBoard on Team {
  id
  name
  key
  rules {
    importantFrom
    urgencyWindowDays
    noDueDate
    dropAlertPercent
    awayStatuses
    blockersAreImportant
    currentCycleIsUrgent
  }
  weather {
    kind
    reason
  }
  backlogRot {
    rotting
    reason
  }
  rebalanceNow: rebalanceSuggestions(horizon: NOW) {
    ...Suggestion
  }
  rebalanceForecast: rebalanceSuggestions(horizon: FORECAST) {
    ...Suggestion
  }
  people {
    id
    name
    avatarUrl
    capacity
    timeOff {
      id
      startsOn
      endsOn
    }
    weather {
      kind
      reason
      overdue
    }
    forecast {
      startsOn
      endsOn
      weather {
        kind
        reason
      }
      summary
      turningUrgent {
        identifier
      }
    }
    matrix {
      ...Matrix
    }
  }
  unassigned {
    ...Matrix
  }
}
fragment Matrix on Matrix {
  counts {
    do
    schedule
    delegate
    drop
  }
  do {
    ...BoardIssue
  }
  schedule {
    ...BoardIssue
  }
  delegate {
    ...BoardIssue
  }
  drop {
    ...BoardIssue
  }
}
fragment Suggestion on Suggestion {
  issue {
    id
    identifier
    title
    url
    quadrant
    becomesUrgentOn
  }
  from {
    id
    name
    avatarUrl
  }
  to {
    id
    name
    avatarUrl
  }
  week
  toWeather
  reason
}
fragment BoardIssue on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  state {
    name
  }
  quadrantSource
  placementReason
}`) as unknown as TypedDocumentString<SetCapacityMutation, SetCapacityMutationVariables>;
export const AddTimeOffDocument = /*#__PURE__*/ new TypedDocumentString(`
    mutation AddTimeOff($teamId: ID!, $userId: ID!, $startsOn: Date!, $endsOn: Date!) {
  addTimeOff(
    teamId: $teamId
    userId: $userId
    startsOn: $startsOn
    endsOn: $endsOn
  ) {
    __typename
    ... on Error {
      message
    }
    ... on TimeOffSuccess {
      team {
        ...TeamBoard
      }
    }
  }
}
    fragment TeamBoard on Team {
  id
  name
  key
  rules {
    importantFrom
    urgencyWindowDays
    noDueDate
    dropAlertPercent
    awayStatuses
    blockersAreImportant
    currentCycleIsUrgent
  }
  weather {
    kind
    reason
  }
  backlogRot {
    rotting
    reason
  }
  rebalanceNow: rebalanceSuggestions(horizon: NOW) {
    ...Suggestion
  }
  rebalanceForecast: rebalanceSuggestions(horizon: FORECAST) {
    ...Suggestion
  }
  people {
    id
    name
    avatarUrl
    capacity
    timeOff {
      id
      startsOn
      endsOn
    }
    weather {
      kind
      reason
      overdue
    }
    forecast {
      startsOn
      endsOn
      weather {
        kind
        reason
      }
      summary
      turningUrgent {
        identifier
      }
    }
    matrix {
      ...Matrix
    }
  }
  unassigned {
    ...Matrix
  }
}
fragment Matrix on Matrix {
  counts {
    do
    schedule
    delegate
    drop
  }
  do {
    ...BoardIssue
  }
  schedule {
    ...BoardIssue
  }
  delegate {
    ...BoardIssue
  }
  drop {
    ...BoardIssue
  }
}
fragment Suggestion on Suggestion {
  issue {
    id
    identifier
    title
    url
    quadrant
    becomesUrgentOn
  }
  from {
    id
    name
    avatarUrl
  }
  to {
    id
    name
    avatarUrl
  }
  week
  toWeather
  reason
}
fragment BoardIssue on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  state {
    name
  }
  quadrantSource
  placementReason
}`) as unknown as TypedDocumentString<AddTimeOffMutation, AddTimeOffMutationVariables>;
export const RemoveTimeOffDocument = /*#__PURE__*/ new TypedDocumentString(`
    mutation RemoveTimeOff($teamId: ID!, $userId: ID!, $timeOffId: ID!) {
  removeTimeOff(teamId: $teamId, userId: $userId, timeOffId: $timeOffId) {
    __typename
    ... on Error {
      message
    }
    ... on TimeOffSuccess {
      team {
        ...TeamBoard
      }
    }
  }
}
    fragment TeamBoard on Team {
  id
  name
  key
  rules {
    importantFrom
    urgencyWindowDays
    noDueDate
    dropAlertPercent
    awayStatuses
    blockersAreImportant
    currentCycleIsUrgent
  }
  weather {
    kind
    reason
  }
  backlogRot {
    rotting
    reason
  }
  rebalanceNow: rebalanceSuggestions(horizon: NOW) {
    ...Suggestion
  }
  rebalanceForecast: rebalanceSuggestions(horizon: FORECAST) {
    ...Suggestion
  }
  people {
    id
    name
    avatarUrl
    capacity
    timeOff {
      id
      startsOn
      endsOn
    }
    weather {
      kind
      reason
      overdue
    }
    forecast {
      startsOn
      endsOn
      weather {
        kind
        reason
      }
      summary
      turningUrgent {
        identifier
      }
    }
    matrix {
      ...Matrix
    }
  }
  unassigned {
    ...Matrix
  }
}
fragment Matrix on Matrix {
  counts {
    do
    schedule
    delegate
    drop
  }
  do {
    ...BoardIssue
  }
  schedule {
    ...BoardIssue
  }
  delegate {
    ...BoardIssue
  }
  drop {
    ...BoardIssue
  }
}
fragment Suggestion on Suggestion {
  issue {
    id
    identifier
    title
    url
    quadrant
    becomesUrgentOn
  }
  from {
    id
    name
    avatarUrl
  }
  to {
    id
    name
    avatarUrl
  }
  week
  toWeather
  reason
}
fragment BoardIssue on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  state {
    name
  }
  quadrantSource
  placementReason
}`) as unknown as TypedDocumentString<RemoveTimeOffMutation, RemoveTimeOffMutationVariables>;
export const TeamDocument = /*#__PURE__*/ new TypedDocumentString(`
    query Team($teamId: ID!) {
  team(id: $teamId) {
    ...TeamBoard
  }
}
    fragment TeamBoard on Team {
  id
  name
  key
  rules {
    importantFrom
    urgencyWindowDays
    noDueDate
    dropAlertPercent
    awayStatuses
    blockersAreImportant
    currentCycleIsUrgent
  }
  weather {
    kind
    reason
  }
  backlogRot {
    rotting
    reason
  }
  rebalanceNow: rebalanceSuggestions(horizon: NOW) {
    ...Suggestion
  }
  rebalanceForecast: rebalanceSuggestions(horizon: FORECAST) {
    ...Suggestion
  }
  people {
    id
    name
    avatarUrl
    capacity
    timeOff {
      id
      startsOn
      endsOn
    }
    weather {
      kind
      reason
      overdue
    }
    forecast {
      startsOn
      endsOn
      weather {
        kind
        reason
      }
      summary
      turningUrgent {
        identifier
      }
    }
    matrix {
      ...Matrix
    }
  }
  unassigned {
    ...Matrix
  }
}
fragment Matrix on Matrix {
  counts {
    do
    schedule
    delegate
    drop
  }
  do {
    ...BoardIssue
  }
  schedule {
    ...BoardIssue
  }
  delegate {
    ...BoardIssue
  }
  drop {
    ...BoardIssue
  }
}
fragment Suggestion on Suggestion {
  issue {
    id
    identifier
    title
    url
    quadrant
    becomesUrgentOn
  }
  from {
    id
    name
    avatarUrl
  }
  to {
    id
    name
    avatarUrl
  }
  week
  toWeather
  reason
}
fragment BoardIssue on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  state {
    name
  }
  quadrantSource
  placementReason
}`) as unknown as TypedDocumentString<TeamQuery, TeamQueryVariables>;