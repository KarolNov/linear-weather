// Trusted documents (persisted queries): the board sends `{ documentId, variables }` instead of
// the query, and the server runs the text it already has under that id. The list comes from the
// board's own .graphql files (`pnpm --filter web codegen` writes trusted-documents.ts), so off
// localhost nobody can send a query the board wouldn't, however it's shaped.
//
// On localhost any query still runs, for GraphiQL and tests. That's where the depth and cost
// limits (limits.ts) matter; they run on trusted documents too, to keep the board honest.

import { createGraphQLError, type GraphQLParams, type Plugin } from "graphql-yoga";
import { TRUSTED_DOCUMENTS } from "./trusted-documents";

export interface TrustedDocumentsOptions {
  /** The documents that may run, by id. */
  documents?: Readonly<Record<string, string>>;
  /** Whether a request may also send a query of its own. */
  allowAnyQuery: (request: Request) => boolean;
}

/** A Yoga plugin that swaps a `documentId` for its document, and refuses other queries. */
export function useTrustedDocuments({
  documents = TRUSTED_DOCUMENTS,
  allowAnyQuery,
}: TrustedDocumentsOptions): Plugin {
  return {
    // Runs before Yoga checks the params, so `documentId` is gone by the time it would object.
    onParams({ params, request, setParams }) {
      const { documentId, ...rest } = params as GraphQLParams & { documentId?: unknown };
      if (documentId === undefined) {
        if (!allowAnyQuery(request)) {
          throw refusal(
            "This server only runs the board's own operations. Send a documentId.",
            "PERSISTED_QUERY_ONLY",
          );
        }
        return;
      }
      if (rest.query !== undefined) {
        throw refusal("Send a documentId or a query, not both.", "BAD_REQUEST");
      }
      if (typeof documentId !== "string" || !Object.hasOwn(documents, documentId)) {
        throw refusal(`No document has the id ${String(documentId)}.`, "PERSISTED_QUERY_NOT_FOUND");
      }
      setParams({ ...rest, query: documents[documentId] });
    },
  };
}

function refusal(message: string, code: string) {
  return createGraphQLError(message, { extensions: { code, http: { status: 400 } } });
}
