// Every operation the board sends, by its trusted-document id: what the server is allowed to run.
// For scripts/trusted-documents.ts and tests; the board itself imports documents one by one.

import { documentId } from "./document-id";
import * as generated from "./generated";

/** The operations in generated.ts, by id. Fragments on their own are left out: nothing runs them. */
export async function trustedDocuments(): Promise<Record<string, string>> {
  const texts = Object.values(generated)
    .filter((value) => value instanceof generated.TypedDocumentString)
    .map(String)
    .filter((text) => /^\s*(query|mutation|subscription)\b/.test(text));
  const entries = await Promise.all(
    texts.map(async (text): Promise<[string, string]> => [await documentId(text), text]),
  );
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : 1)));
}
