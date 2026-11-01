/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type IssueByIdQueryVariables = Exact<{
  id: string;
}>;


export type IssueByIdQuery = { issues: { nodes: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, team: { id: string, name: string, key: string }, assignee: { id: string, name: string, avatarUrl: string | null } | null, state: { name: string, type: string } }> } };

export type ReassignIssueMutationVariables = Exact<{
  id: string;
  assigneeId: string;
}>;


export type ReassignIssueMutation = { issueUpdate: { success: boolean, issue: { id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, team: { id: string, name: string, key: string }, assignee: { id: string, name: string, avatarUrl: string | null } | null, state: { name: string, type: string } } | null } };

export type IssueCardFragment = { id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, assignee: { id: string, name: string, avatarUrl: string | null } | null, state: { name: string, type: string } };

export type OpenIssuesQueryVariables = Exact<{
  teamIds: Array<string> | string;
  first: number;
  after?: string | null | undefined;
}>;


export type OpenIssuesQuery = { issues: { nodes: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, team: { id: string }, assignee: { id: string, name: string, avatarUrl: string | null } | null, state: { name: string, type: string } }>, pageInfo: { hasNextPage: boolean, endCursor: string | null } } };

export type TeamsQueryVariables = Exact<{ [key: string]: never; }>;


export type TeamsQuery = { teams: { nodes: Array<{ id: string, name: string, key: string }> }, viewer: { teams: { nodes: Array<{ id: string }> } } };

export type TeamSummaryFragment = { id: string, name: string, key: string };

export type TeamsMembersQueryVariables = Exact<{
  teamIds: Array<string> | string;
  first: number;
}>;


export type TeamsMembersQuery = { teams: { nodes: Array<{ id: string, members: { nodes: Array<{ id: string, name: string, avatarUrl: string | null }> } }> } };

export type ViewerQueryVariables = Exact<{ [key: string]: never; }>;


export type ViewerQuery = { viewer: { id: string, name: string, avatarUrl: string | null, organization: { name: string, urlKey: string } } };

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
export const IssueCardFragmentDoc = /*#__PURE__*/ new TypedDocumentString(`
    fragment IssueCard on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  assignee {
    id
    name
    avatarUrl
  }
  state {
    name
    type
  }
}
    `, {"fragmentName":"IssueCard"}) as unknown as TypedDocumentString<IssueCardFragment, unknown>;
export const TeamSummaryFragmentDoc = /*#__PURE__*/ new TypedDocumentString(`
    fragment TeamSummary on Team {
  id
  name
  key
}
    `, {"fragmentName":"TeamSummary"}) as unknown as TypedDocumentString<TeamSummaryFragment, unknown>;
export const IssueByIdDocument = /*#__PURE__*/ new TypedDocumentString(`
    query IssueById($id: ID!) {
  issues(first: 1, includeArchived: true, filter: { id: { eq: $id } }) {
    nodes {
      ...IssueCard
      team {
        ...TeamSummary
      }
    }
  }
}
    fragment IssueCard on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  assignee {
    id
    name
    avatarUrl
  }
  state {
    name
    type
  }
}
fragment TeamSummary on Team {
  id
  name
  key
}`) as unknown as TypedDocumentString<IssueByIdQuery, IssueByIdQueryVariables>;
export const ReassignIssueDocument = /*#__PURE__*/ new TypedDocumentString(`
    mutation ReassignIssue($id: String!, $assigneeId: String!) {
  issueUpdate(id: $id, input: { assigneeId: $assigneeId }) {
    success
    issue {
      ...IssueCard
      team {
        ...TeamSummary
      }
    }
  }
}
    fragment IssueCard on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  assignee {
    id
    name
    avatarUrl
  }
  state {
    name
    type
  }
}
fragment TeamSummary on Team {
  id
  name
  key
}`) as unknown as TypedDocumentString<ReassignIssueMutation, ReassignIssueMutationVariables>;
export const OpenIssuesDocument = /*#__PURE__*/ new TypedDocumentString(`
    query OpenIssues($teamIds: [ID!]!, $first: Int!, $after: String) {
  issues(
    first: $first
    after: $after
    filter: {
      team: { id: { in: $teamIds } }
      state: { type: { nin: ["completed", "canceled"] } }
    }
  ) {
    nodes {
      ...IssueCard
      team {
        id
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
    fragment IssueCard on Issue {
  id
  identifier
  title
  url
  dueDate
  priority
  estimate
  assignee {
    id
    name
    avatarUrl
  }
  state {
    name
    type
  }
}`) as unknown as TypedDocumentString<OpenIssuesQuery, OpenIssuesQueryVariables>;
export const TeamsDocument = /*#__PURE__*/ new TypedDocumentString(`
    query Teams {
  teams(first: 250) {
    nodes {
      ...TeamSummary
    }
  }
  viewer {
    teams(first: 250) {
      nodes {
        id
      }
    }
  }
}
    fragment TeamSummary on Team {
  id
  name
  key
}`) as unknown as TypedDocumentString<TeamsQuery, TeamsQueryVariables>;
export const TeamsMembersDocument = /*#__PURE__*/ new TypedDocumentString(`
    query TeamsMembers($teamIds: [ID!]!, $first: Int!) {
  teams(first: $first, filter: { id: { in: $teamIds } }) {
    nodes {
      id
      members(first: 250) {
        nodes {
          id
          name
          avatarUrl
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<TeamsMembersQuery, TeamsMembersQueryVariables>;
export const ViewerDocument = /*#__PURE__*/ new TypedDocumentString(`
    query Viewer {
  viewer {
    id
    name
    avatarUrl
    organization {
      name
      urlKey
    }
  }
}
    `) as unknown as TypedDocumentString<ViewerQuery, ViewerQueryVariables>;