/* eslint-disable */
import * as types from './graphql';



/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  fragment IssueCard on Issue {\n    id\n    identifier\n    title\n    dueDate\n    priority\n    estimate\n    assignee {\n      id\n      name\n      avatarUrl\n    }\n    state {\n      name\n      type\n    }\n  }\n": typeof types.IssueCardFragmentDoc,
    "\n  query TeamOpenIssues($teamId: ID!, $first: Int!, $after: String) {\n    issues(\n      first: $first\n      after: $after\n      filter: {\n        team: { id: { eq: $teamId } }\n        state: { type: { nin: [\"completed\", \"canceled\"] } }\n      }\n    ) {\n      nodes {\n        ...IssueCard\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.TeamOpenIssuesDocument,
    "\n  query Viewer {\n    viewer {\n      id\n      name\n      avatarUrl\n      organization {\n        name\n        urlKey\n      }\n    }\n  }\n": typeof types.ViewerDocument,
};
const documents: Documents = {
    "\n  fragment IssueCard on Issue {\n    id\n    identifier\n    title\n    dueDate\n    priority\n    estimate\n    assignee {\n      id\n      name\n      avatarUrl\n    }\n    state {\n      name\n      type\n    }\n  }\n": types.IssueCardFragmentDoc,
    "\n  query TeamOpenIssues($teamId: ID!, $first: Int!, $after: String) {\n    issues(\n      first: $first\n      after: $after\n      filter: {\n        team: { id: { eq: $teamId } }\n        state: { type: { nin: [\"completed\", \"canceled\"] } }\n      }\n    ) {\n      nodes {\n        ...IssueCard\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.TeamOpenIssuesDocument,
    "\n  query Viewer {\n    viewer {\n      id\n      name\n      avatarUrl\n      organization {\n        name\n        urlKey\n      }\n    }\n  }\n": types.ViewerDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment IssueCard on Issue {\n    id\n    identifier\n    title\n    dueDate\n    priority\n    estimate\n    assignee {\n      id\n      name\n      avatarUrl\n    }\n    state {\n      name\n      type\n    }\n  }\n"): typeof import('./graphql').IssueCardFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query TeamOpenIssues($teamId: ID!, $first: Int!, $after: String) {\n    issues(\n      first: $first\n      after: $after\n      filter: {\n        team: { id: { eq: $teamId } }\n        state: { type: { nin: [\"completed\", \"canceled\"] } }\n      }\n    ) {\n      nodes {\n        ...IssueCard\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): typeof import('./graphql').TeamOpenIssuesDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Viewer {\n    viewer {\n      id\n      name\n      avatarUrl\n      organization {\n        name\n        urlKey\n      }\n    }\n  }\n"): typeof import('./graphql').ViewerDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
