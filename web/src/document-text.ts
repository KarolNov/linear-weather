// For tests: the text behind a trusted-document id, read from the list the server runs, not
// from generated.ts. A test that answers by this text sees what production would run, so ids
// left stale after a .graphql change fail here instead of quietly dropping fields.

import { TRUSTED_DOCUMENTS } from "../../server/src/trusted-documents";

/** The text the server runs for this id. Throws if the server doesn't trust it. */
export function documentText(id: string): string {
  const text = TRUSTED_DOCUMENTS[id];
  if (text === undefined) throw new Error(`The server trusts no document with the id ${id}.`);
  return text;
}
