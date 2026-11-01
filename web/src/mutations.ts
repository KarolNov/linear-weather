// Changing the board from the browser: a team's rules, where one issue sits, or who has it. Every mutation
// asks for the team's board back, so the page redraws from the answer with nothing derived here.

import {
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
  /** The team's board as it stands; null when it can't be read. */
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

  async function send(query: string, variables: Record<string, unknown>): Promise<MutationResult> {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) throw new Error(`server responded ${res.status}`);
      const { data, errors = [] } = (await res.json()) as {
        data?: Record<string, MutationPayload> | null;
        errors?: { message: string; path?: (string | number)[] }[];
      };
      const payload = data && Object.values(data)[0];
      // The change is made before the board is read back, so an error below the mutation's own
      // field means it was saved and only the board failed to load, e.g. Linear's rate limit.
      // That error nulls everything up to `data`, so there's no board to redraw from.
      if (errors.some((e) => (e.path?.length ?? 0) > 1)) {
        console.error(`Saved, but couldn't read the board back: ${errors.map((e) => e.message)}`);
        return { ok: true, team: payload?.team ?? null };
      }
      if (!payload || errors.length > 0) {
        throw new Error(errors.map((e) => e.message).join("; ") || "no data");
      }
      if (payload.team) return { ok: true, team: payload.team };
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
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: TEAM_QUERY, variables: { teamId } }),
      });
      if (!res.ok) throw new Error(`server responded ${res.status}`);
      const { data } = (await res.json()) as { data?: { team: TeamBoardData | null } | null };
      return data?.team ?? null;
    } catch (error) {
      console.error(`Couldn't read the board again: ${error}`);
      return null;
    }
  }

  return {
    updateRules: (teamId, rules) => queued(UPDATE_RULES_MUTATION, { teamId, input: rules }),
    placeIssue: (issueId, quadrant) =>
      quadrant
        ? queued(OVERRIDE_MUTATION, { issueId, quadrant: quadrant.toUpperCase() })
        : queued(CLEAR_OVERRIDE_MUTATION, { issueId }),
    reassign: (issueId, userId) => queued(REASSIGN_MUTATION, { issueId, userId }),
    // After the moves sent before it, so it reads what they left.
    readTeam: (teamId) => inTurn(() => read(teamId)),
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
      // plan again from the board as it stands; failing that, from the last move made.
      applied.team = (await client.readTeam(teamId)) ?? applied.team;
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
