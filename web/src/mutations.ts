// Changing the board from the browser: a team's rules, where one issue sits, or who has it. Every mutation
// asks for the team's board back, so the page redraws from the answer with nothing derived here.

import {
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
    const result = queue.then(() => send(query, variables));
    queue = result;
    return result;
  }

  return {
    updateRules: (teamId, rules) => queued(UPDATE_RULES_MUTATION, { teamId, input: rules }),
    placeIssue: (issueId, quadrant) =>
      quadrant
        ? queued(OVERRIDE_MUTATION, { issueId, quadrant: quadrant.toUpperCase() })
        : queued(CLEAR_OVERRIDE_MUTATION, { issueId }),
    reassign: (issueId, userId) => queued(REASSIGN_MUTATION, { issueId, userId }),
  } satisfies BoardClient;
}

/** How a run of moves went. */
export interface AppliedMoves {
  /** The moves made, in order, up to the first that failed. */
  moved: Suggestion[];
  /** The first move that failed, and why. Those after it weren't tried. */
  failed: { move: Suggestion; message: string } | null;
  /** The board after the last move made; null when none was, or it couldn't be read back. */
  team: TeamBoardData | null;
}

/**
 * Makes moves one at a time, in order, stopping at the first that fails: each move was planned
 * from the board the ones before it leave, so the rest may not make sense without it.
 */
export async function applyMoves(
  client: Pick<BoardClient, "reassign">,
  moves: Suggestion[],
): Promise<AppliedMoves> {
  const applied: AppliedMoves = { moved: [], failed: null, team: null };
  for (const move of moves) {
    const result = await client.reassign(move.issue.id, move.to.id);
    if (!result.ok) {
      applied.failed = { move, message: result.message };
      break;
    }
    applied.moved.push(move);
    applied.team = result.team;
  }
  return applied;
}
