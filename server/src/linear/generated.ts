/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type BlockingFragment = { relations: { nodes: Array<{ type: string, relatedIssue: { state: { type: string } } }>, pageInfo: { hasNextPage: boolean } } };

export type OpenBlockersQueryVariables = Exact<{
  teamIds: Array<string> | string;
  first: number;
  after?: string | null | undefined;
}>;


export type OpenBlockersQuery = { issues: { nodes: Array<{ id: string, team: { id: string }, relations: { nodes: Array<{ type: string, relatedIssue: { state: { type: string } } }>, pageInfo: { hasNextPage: boolean } } }>, pageInfo: { hasNextPage: boolean, endCursor: string | null } } };

export type IssueByIdQueryVariables = Exact<{
  id: string;
}>;


export type IssueByIdQuery = { issues: { nodes: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, team: { id: string, name: string, key: string }, assignee: { id: string, name: string, avatarUrl: string | null, statusEmoji: string | null, statusLabel: string | null, statusUntilAt: string | null, timezone: string | null } | null, state: { name: string, type: string }, relations: { nodes: Array<{ type: string, relatedIssue: { state: { type: string } } }>, pageInfo: { hasNextPage: boolean } } }> } };

export type ReassignIssueMutationVariables = Exact<{
  id: string;
  assigneeId: string;
}>;


export type ReassignIssueMutation = { issueUpdate: { success: boolean, issue: { id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, team: { id: string, name: string, key: string }, assignee: { id: string, name: string, avatarUrl: string | null, statusEmoji: string | null, statusLabel: string | null, statusUntilAt: string | null, timezone: string | null } | null, state: { name: string, type: string }, relations: { nodes: Array<{ type: string, relatedIssue: { state: { type: string } } }>, pageInfo: { hasNextPage: boolean } } } | null } };

export type IssueCardFragment = { id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, assignee: { id: string, name: string, avatarUrl: string | null, statusEmoji: string | null, statusLabel: string | null, statusUntilAt: string | null, timezone: string | null } | null, state: { name: string, type: string } };

export type PersonFragment = { id: string, name: string, avatarUrl: string | null, statusEmoji: string | null, statusLabel: string | null, statusUntilAt: string | null, timezone: string | null };

export type OpenIssuesQueryVariables = Exact<{
  teamIds: Array<string> | string;
  first: number;
  after?: string | null | undefined;
}>;


export type OpenIssuesQuery = { issues: { nodes: Array<{ id: string, identifier: string, title: string, url: string, dueDate: string | null, priority: number, estimate: number | null, team: { id: string }, assignee: { id: string, name: string, avatarUrl: string | null, statusEmoji: string | null, statusLabel: string | null, statusUntilAt: string | null, timezone: string | null } | null, state: { name: string, type: string } }>, pageInfo: { hasNextPage: boolean, endCursor: string | null } } };

export type TeamsQueryVariables = Exact<{ [key: string]: never; }>;


export type TeamsQuery = { teams: { nodes: Array<{ id: string, name: string, key: string }> }, viewer: { teams: { nodes: Array<{ id: string }> } } };

export type TeamSummaryFragment = { id: string, name: string, key: string };

export type TeamsMembersQueryVariables = Exact<{
  teamIds: Array<string> | string;
  first: number;
}>;


export type TeamsMembersQuery = { teams: { nodes: Array<{ id: string, members: { nodes: Array<{ id: string, name: string, avatarUrl: string | null, statusEmoji: string | null, statusLabel: string | null, statusUntilAt: string | null, timezone: string | null }> } }> } };

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
export const BlockingFragmentDoc = /*#__PURE__*/ new TypedDocumentString(`
    fragment Blocking on Issue {
  relations(first: 20) {
    nodes {
      type
      relatedIssue {
        state {
          type
        }
      }
    }
    pageInfo {
      hasNextPage
    }
  }
}
    `, {"fragmentName":"Blocking"}) as unknown as TypedDocumentString<BlockingFragment, unknown>;
export const PersonFragmentDoc = /*#__PURE__*/ new TypedDocumentString(`
    fragment Person on User {
  id
  name
  avatarUrl
  statusEmoji
  statusLabel
  statusUntilAt
  timezone
}
    `, {"fragmentName":"Person"}) as unknown as TypedDocumentString<PersonFragment, unknown>;
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
    ...Person
  }
  state {
    name
    type
  }
}
    fragment Person on User {
  id
  name
  avatarUrl
  statusEmoji
  statusLabel
  statusUntilAt
  timezone
}`, {"fragmentName":"IssueCard"}) as unknown as TypedDocumentString<IssueCardFragment, unknown>;
export const TeamSummaryFragmentDoc = /*#__PURE__*/ new TypedDocumentString(`
    fragment TeamSummary on Team {
  id
  name
  key
}
    `, {"fragmentName":"TeamSummary"}) as unknown as TypedDocumentString<TeamSummaryFragment, unknown>;
export const OpenBlockersDocument = /*#__PURE__*/ new TypedDocumentString(`
    query OpenBlockers($teamIds: [ID!]!, $first: Int!, $after: String) {
  issues(
    first: $first
    after: $after
    filter: {
      team: { id: { in: $teamIds } }
      state: { type: { nin: ["completed", "canceled"] } }
      hasBlockingRelations: { eq: true }
    }
  ) {
    nodes {
      id
      team {
        id
      }
      ...Blocking
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
    fragment Blocking on Issue {
  relations(first: 20) {
    nodes {
      type
      relatedIssue {
        state {
          type
        }
      }
    }
    pageInfo {
      hasNextPage
    }
  }
}`) as unknown as TypedDocumentString<OpenBlockersQuery, OpenBlockersQueryVariables>;
export const IssueByIdDocument = /*#__PURE__*/ new TypedDocumentString(`
    query IssueById($id: ID!) {
  issues(first: 1, includeArchived: true, filter: { id: { eq: $id } }) {
    nodes {
      ...IssueCard
      ...Blocking
      team {
        ...TeamSummary
      }
    }
  }
}
    fragment Blocking on Issue {
  relations(first: 20) {
    nodes {
      type
      relatedIssue {
        state {
          type
        }
      }
    }
    pageInfo {
      hasNextPage
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
    ...Person
  }
  state {
    name
    type
  }
}
fragment Person on User {
  id
  name
  avatarUrl
  statusEmoji
  statusLabel
  statusUntilAt
  timezone
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
      ...Blocking
      team {
        ...TeamSummary
      }
    }
  }
}
    fragment Blocking on Issue {
  relations(first: 20) {
    nodes {
      type
      relatedIssue {
        state {
          type
        }
      }
    }
    pageInfo {
      hasNextPage
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
    ...Person
  }
  state {
    name
    type
  }
}
fragment Person on User {
  id
  name
  avatarUrl
  statusEmoji
  statusLabel
  statusUntilAt
  timezone
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
    ...Person
  }
  state {
    name
    type
  }
}
fragment Person on User {
  id
  name
  avatarUrl
  statusEmoji
  statusLabel
  statusUntilAt
  timezone
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
          ...Person
        }
      }
    }
  }
}
    fragment Person on User {
  id
  name
  avatarUrl
  statusEmoji
  statusLabel
  statusUntilAt
  timezone
}`) as unknown as TypedDocumentString<TeamsMembersQuery, TeamsMembersQueryVariables>;
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