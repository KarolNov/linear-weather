// The board sends its operations to our server as trusted documents: an id the server looks up
// in the list `pnpm --filter web codegen` writes for it (server/src/trusted-documents.ts),
// instead of the query itself. Off localhost the server runs nothing else, so nobody can send it
// a query the board wouldn't.

const ids = new Map<string, Promise<string>>();

/**
 * A document's id: `sha256:` and the hex SHA-256 of its text, as the GraphQL over HTTP spec's
 * draft on persisted documents spells it. Worked out once per document.
 */
export function documentId(document: { toString(): string }): Promise<string> {
  const text = document.toString();
  let id = ids.get(text);
  if (!id) {
    id = sha256(text).then((hex) => `sha256:${hex}`);
    ids.set(text, id);
  }
  return id;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
