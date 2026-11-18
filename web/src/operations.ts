// Every operation the board sends, by name, and the text behind a trusted-document id.
// For scripts/trusted-documents.ts and tests; the board itself imports documents one by one.

import { DOCUMENT_IDS } from "./document-ids";
import * as generated from "./generated";

/** The operations in generated.ts, by name. Fragments on their own are left out: nothing runs them. */
export function operations(): Record<string, string> {
  const entries = Object.values(generated)
    .filter((value) => value instanceof generated.TypedDocumentString)
    .map(String)
    .flatMap((text): [string, string][] => {
      const name = operationName(text);
      return name ? [[name, text]] : [];
    });
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** The name of the operation a document's text starts with, if it starts with one. */
export function operationName(text: string): string | undefined {
  return /^\s*(?:query|mutation|subscription)\s+(\w+)/.exec(text)?.[1];
}

/** The text of the board's document with this id, as the server looks it up. Throws if unknown. */
export function documentText(id: string): string {
  const name = Object.entries(DOCUMENT_IDS).find(([, known]) => known === id)?.[0];
  const text = name === undefined ? undefined : operations()[name];
  if (text === undefined) throw new Error(`No board operation has the id ${id}.`);
  return text;
}
