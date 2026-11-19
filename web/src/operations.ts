// Every operation the board sends, by name. For scripts/trusted-documents.ts and tests; the board
// itself imports documents one by one.

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
