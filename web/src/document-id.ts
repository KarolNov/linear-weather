// The board sends its operations to our server as trusted documents: an id the server looks up
// in the list `pnpm --filter web codegen` writes for it (server/src/trusted-documents.ts),
// instead of the query itself. Off localhost the server runs nothing else, so nobody can send it
// a query the board wouldn't.
//
// Codegen works the ids out (document-ids.ts), so the board never hashes anything itself.

import { DOCUMENT_IDS } from "./document-ids";
import { operationName } from "./operations";

/**
 * A document's id: `sha256:` and the hex SHA-256 of its text, as the GraphQL over HTTP spec's
 * draft on persisted documents spells it.
 */
export function documentId(document: { toString(): string }): string {
  const name = operationName(document.toString());
  const id = name === undefined ? undefined : (DOCUMENT_IDS as Record<string, string>)[name];
  if (id === undefined) {
    throw new Error(`No id for ${name ?? "this document"}. Run \`pnpm --filter web codegen\`.`);
  }
  return id;
}
