// Changing the board from the browser: a team's rules, or where one issue sits. Every mutation
// asks for the team's board back, so the page redraws from the answer with nothing derived here.

import { type Quadrant, type Rules, TEAM_BOARD_FRAGMENTS, type TeamBoardData } from "./board";

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

/** Something wrong with proposed rules, on the field the form should mark. */
export interface RuleProblem {
  field: keyof Rules;
  message: string;
}

/** The team's board after the change, or why nothing changed. */
export type MutationResult =
  | { ok: true; team: TeamBoardData }
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
      const { data, errors } = (await res.json()) as {
        data?: Record<string, MutationPayload> | null;
        errors?: { message: string }[];
      };
      const payload = data && Object.values(data)[0];
      if (!payload || errors?.length) {
        throw new Error(errors?.map((e) => e.message).join("; ") || "no data");
      }
      if (payload.team) return { ok: true, team: payload.team };
      return {
        ok: false,
        message: payload.message ?? "That didn't work. Please try again.",
        problems: payload.problems ?? [],
      };
    } catch (error) {
      console.error(`Couldn't save a change to the board: ${error}`);
      return { ok: false, message: "Couldn't save that just now. Please try again.", problems: [] };
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
  } satisfies BoardClient;
}
