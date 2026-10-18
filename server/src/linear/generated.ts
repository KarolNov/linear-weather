/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type IssueCardFragment = { id: string, identifier: string, title: string, dueDate: string | null, priority: number, estimate: number | null, assignee: { id: string, name: string, avatarUrl: string | null } | null, state: { name: string, type: string } };

export type TeamOpenIssuesQueryVariables = Exact<{
  teamId: string;
  first: number;
  after?: string | null | undefined;
}>;


export type TeamOpenIssuesQuery = { issues: { nodes: Array<{ id: string, identifier: string, title: string, dueDate: string | null, priority: number, estimate: number | null, assignee: { id: string, name: string, avatarUrl: string | null } | null, state: { name: string, type: string } }>, pageInfo: { hasNextPage: boolean, endCursor: string | null } } };

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
export const TeamOpenIssuesDocument = /*#__PURE__*/ new TypedDocumentString(`
    query TeamOpenIssues($teamId: ID!, $first: Int!, $after: String) {
  issues(
    first: $first
    after: $after
    filter: {
      team: { id: { eq: $teamId } }
      state: { type: { nin: ["completed", "canceled"] } }
    }
  ) {
    nodes {
      ...IssueCard
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
}`) as unknown as TypedDocumentString<TeamOpenIssuesQuery, TeamOpenIssuesQueryVariables>;
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