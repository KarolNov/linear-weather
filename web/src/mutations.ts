// Changing the board from the browser: a team's rules, where one issue sits, who has it, or how much
// someone works and when they're away. Every mutation
// asks for the team's board back, so the page redraws from the answer with nothing derived here.

import {
  type CalendarDate,
  listOf,
  type Quadrant,
  type Rules,
  type Suggestion,
  TEAM_BOARD_FRAGMENTS,
  type TeamBoardData,
} from "./board";

// Each answers with the team's board, or the failure's message.
const RESULT_FIELDS = `
  __typename
  ... on Error { message }
`;

export const UPDATE_RULES_MUTATION = `mutation UpdateRules($teamId: ID!, $input: QuadrantRulesInput!) {
  updateQuadrantRules(teamId: $teamId, input: $input) {
    ${RESULT_FIELDS}
    ... on InvalidRules { problems { field message } }
    ... on UpdateRulesSuccess { team { ...TeamBoard } }
  }
}

${TEAM_BOARD_FRAGMENTS}`;

export const OVERRIDE_MUTATION = `mutation OverrideQuadrant($issueId: ID!, $quadrant: Quadrant!) {
  overrideQuadrant(issueId: $issueId, quadrant: $quadrant) {
    ${RESULT_FIELDS}
    ... on OverrideSuccess { team { ...TeamBoard } }
  }
}

${TEAM_BOARD_FRAGMENTS}`;

export const CLEAR_OVERRIDE_MUTATION = `mutation ClearOverride($issueId: ID!) {
  clearOverride(issueId: $issueId) {
    ${RESULT_FIELDS}
    ... on OverrideSuccess { team { ...TeamBoard } }
  }
}

${TEAM_BOARD_FRAGMENTS}`;

export const REASSIGN_MUTATION = `mutation ReassignIssue($issueId: ID!, $userId: ID!) {
  reassignIssue(issueId: $issueId, userId: $userId) {
    ${RESULT_FIELDS}
    ... on ReassignSuccess { team { ...TeamBoard } }
  }
}

${TEAM_BOARD_FRAGMENTS}`;

export const SET_CAPACITY_MUTATION = `mutation SetCapacity($teamId: ID!, $userId: ID!, $factor: Float!) {
  setCapacity(teamId: $teamId, userId: $userId, factor: $factor) {
    ${RESULT_FIELDS}
    ... on SetCapacitySuccess { team { ...TeamBoard } }
  }
}

${TEAM_BOARD_FRAGMENTS}`;

export const ADD_TIME_OFF_MUTATION = `mutation AddTimeOff($teamId: ID!, $userId: ID!, $startsOn: Date!, $endsOn: Date!) {
  addTimeOff(teamId: $teamId, userId: $userId, startsOn: $startsOn, endsOn: $endsOn) {
    ${RESULT_FIELDS}
    ... on TimeOffSuccess { team { ...TeamBoard } }
  }
}

${TEAM_BOARD_FRAGMENTS}`;

export const REMOVE_TIME_OFF_MUTATION = `mutation RemoveTimeOff($teamId: ID!, $userId: ID!, $timeOffId: ID!) {
  removeTimeOff(teamId: $teamId, userId: $userId, timeOffId: $timeOffId) {
    ${RESULT_FIELDS}
    ... on TimeOffSuccess { team { ...TeamBoard } }
  }
}

${TEAM_BOARD_FRAGMENTS}`;

/** A team's board as it stands, to plan again from after a move failed. */
export const TEAM_QUERY = `query Team($teamId: ID!) {
  team(id: $teamId) { ...TeamBoard }
}

${TEAM_BOARD_FRAGMENTS}`;

/** Something wrong with proposed rules, on the field the form should mark. */
export interface RuleProblem {
  field: keyof Rules;
  message: string;
}

/**
 * The team's board after the change, or why nothing changed. Saved with a null team means the
 * board couldn't be read back afterwards.
 */
export type MutationResult =
  | { ok: true; team: TeamBoardData | null }
  | { ok: false; message: string; problems: RuleProblem[] };

/** What a mutation field answers, whichever union member it is. */
interface MutationPayload {
  __typename: string;
  message?: string;
  problems?: RuleProblem[];
  team?: TeamBoardData;
}

export interface BoardClient {
  updateRules(teamId: string, rules: Rules): Promise<MutationResult>;
  /** Places an issue by hand, or with null hands it back to the rules. */
  placeIssue(issueId: string, quadrant: Quadrant | null): Promise<MutationResult>;
  /** Hands an issue to someone else on its team, in Linear. */
  reassign(issueId: string, userId: string): Promise<MutationResult>;
  /** How much of a full-time week someone works, on every team; answers with this team's board. */
  setCapacity(teamId: string, userId: string, factor: number): Promise<MutationResult>;
  /** Marks someone away, days included, on every team; answers with this team's board. */
  addTimeOff(
    teamId: string,
    userId: string,
    startsOn: CalendarDate,
    endsOn: CalendarDate,
  ): Promise<MutationResult>;
  /** Takes back a stretch of someone's time off; answers with this team's board. */
  removeTimeOff(teamId: string, userId: string, timeOffId: string): Promise<MutationResult>;
  /**
   * The team's board as it stands, else the newest one an answer carried; null when there's
   * neither.
   */
  readTeam(teamId: string): Promise<TeamBoardData | null>;
}

/**
 * Sends the board's mutations to our GraphQL server, one at a time. The demo needs that: each
 * request starts from the `lw_demo` cookie it arrived with and writes back the whole state, so
 * two in flight would lose one change. Signed in, it keeps answers arriving in the order the PM
 * made the changes, so the board always ends on the last one.
 *
 * Network failures and top-level GraphQL errors (the unexpected, like the database failing)
 * come back as a failed result too, with a message to show.
 */
export function boardClient(demo: boolean, fetch: typeof globalThis.fetch = globalThis.fetch) {
  // The server decides it's the demo from the /graphql URL, not the page's.
  const endpoint = demo ? "/graphql?demo=true" : "/graphql";
  let queue: Promise<unknown> = Promise.resolve();
  // Each team's newest board any answer carried, for when the board can't be read again.
  const latest = new Map<string, TeamBoardData>();
  const remember = (team: TeamBoardData | null | undefined) => {
    if (team) latest.set(team.id, team);
    return team ?? null;
  };

  /** Sends one operation and hands back the answer's body. Throws on an HTTP error. */
  async function post<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`server responded ${res.status}`);
    return (await res.json()) as T;
  }

  async function send(query: string, variables: Record<string, unknown>): Promise<MutationResult> {
    try {
      const { data, errors = [] } = await post<{
        data?: Record<string, MutationPayload> | null;
        errors?: { message: string; path?: (string | number)[] }[];
      }>(query, variables);
      const payload = data && Object.values(data)[0];
      // The change is made before the board is read back, so an error below the mutation's own
      // field means it was saved and only the board failed to load, e.g. Linear's rate limit.
      // That error nulls everything up to `data`, so there's no board to redraw from.
      if (errors.some((e) => (e.path?.length ?? 0) > 1)) {
        console.error(`Saved, but couldn't read the board back: ${errors.map((e) => e.message)}`);
        return { ok: true, team: remember(payload?.team) };
      }
      if (!payload || errors.length > 0) {
        throw new Error(errors.map((e) => e.message).join("; ") || "no data");
      }
      if (payload.team) return { ok: true, team: remember(payload.team) };
      return {
        ok: false,
        message: payload.message ?? "That didn't work. Please try again.",
        problems: payload.problems ?? [],
      };
    } catch (error) {
      console.error(`Couldn't save a change to the board: ${error}`);
      return { ok: false, message: "Something went wrong. Please try again.", problems: [] };
    }
  }

  /** Runs `send` once everything sent before it has answered. */
  function queued(query: string, variables: Record<string, unknown>) {
    return inTurn(() => send(query, variables));
  }

  /** Runs `work` once everything sent before it has answered. */
  function inTurn<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work);
    queue = result;
    return result;
  }

  async function read(teamId: string): Promise<TeamBoardData | null> {
    try {
      const { data } = await post<{ data?: { team: TeamBoardData | null } | null }>(TEAM_QUERY, {
        teamId,
      });
      return remember(data?.team);
    } catch (error) {
      console.error(`Couldn't read the board again: ${error}`);
      return null;
    }
  }

  /**
   * A change to someone, which counts on every team they're on, so other teams' boards kept here
   * are out of date once it's made.
   */
  async function everywhere(teamId: string, sent: Promise<MutationResult>) {
    const result = await sent;
    if (result.ok) for (const id of [...latest.keys()]) if (id !== teamId) latest.delete(id);
    return result;
  }

  return {
    updateRules: (teamId, rules) => queued(UPDATE_RULES_MUTATION, { teamId, input: rules }),
    placeIssue: (issueId, quadrant) =>
      quadrant
        ? queued(OVERRIDE_MUTATION, { issueId, quadrant: quadrant.toUpperCase() })
        : queued(CLEAR_OVERRIDE_MUTATION, { issueId }),
    reassign: (issueId, userId) => queued(REASSIGN_MUTATION, { issueId, userId }),
    setCapacity: (teamId, userId, factor) =>
      everywhere(teamId, queued(SET_CAPACITY_MUTATION, { teamId, userId, factor })),
    addTimeOff: (teamId, userId, startsOn, endsOn) =>
      everywhere(teamId, queued(ADD_TIME_OFF_MUTATION, { teamId, userId, startsOn, endsOn })),
    removeTimeOff: (teamId, userId, timeOffId) =>
      everywhere(teamId, queued(REMOVE_TIME_OFF_MUTATION, { teamId, userId, timeOffId })),
    // After the moves sent before it, so it reads what they left. Failing that, the newest board
    // an answer carried, which is no older than anything shown.
    readTeam: (teamId) => inTurn(async () => (await read(teamId)) ?? latest.get(teamId) ?? null),
  } satisfies BoardClient;
}

/** How a run of moves went. */
export interface AppliedMoves {
  /** The moves made, in order, up to the first that failed. */
  moved: Suggestion[];
  /** The first move that failed, and why. Those after it weren't tried. */
  failed: { move: Suggestion; message: string } | null;
  /**
   * The board after the last move, or as read again after a failure; null when it couldn't be
   * read, or there were no moves.
   */
  team: TeamBoardData | null;
}

/**
 * Makes moves one at a time, in order, stopping at the first that fails: each move was planned
 * from the board the ones before it leave, so the rest may not make sense without it. After a
 * failure the board is read again.
 */
export async function applyMoves(
  client: Pick<BoardClient, "reassign" | "readTeam">,
  teamId: string,
  moves: Suggestion[],
): Promise<AppliedMoves> {
  const applied: AppliedMoves = { moved: [], failed: null, team: null };
  for (const move of moves) {
    const result = await client.reassign(move.issue.id, move.to.id);
    if (!result.ok) {
      applied.failed = { move, message: result.message };
      // What failed may have changed things too (it was reassigned in Linear meanwhile, say), so
      // plan again from the board as it stands.
      applied.team = await client.readTeam(teamId);
      break;
    }
    applied.moved.push(move);
    applied.team = result.team;
  }
  return applied;
}

/** How a run of `moves` went, as the board tells the PM: a status, or what failed and why. */
export function describeMoves(
  moves: Suggestion[],
  { moved, failed }: AppliedMoves,
): { status: string } | { failure: string } {
  const handed = (list: Suggestion[]) =>
    listOf(list.map(({ issue, to }) => `${issue.identifier} to ${to.name}`));
  if (failed) {
    const { issue, to } = failed.move;
    const rest = moves.indexOf(failed.move) < moves.length - 1 ? ", so the rest weren't made" : "";
    const before = moved.length > 0 ? `Handed ${handed(moved)}. ` : "";
    return {
      failure: `${before}Couldn't hand ${issue.identifier} to ${to.name}${rest}. ${failed.message}`,
    };
  }
  const [only] = moved;
  if (moved.length === 1 && only)
    return { status: `${only.issue.identifier} is ${only.to.name}'s now.` };
  return { status: `Handed ${handed(moved)}. The board is planned again from here.` };
}
