// Works out each board operation's trusted-document id and writes:
// - server/src/trusted-documents.ts: the documents the server runs off localhost, by id, and the
//   current id of each operation. The list only grows: a tab still running an older bundle sends
//   an older id, which has to keep working after the next deploy.
// - web/src/document-ids.ts: each operation's current id, by name, which the board sends.
// With --check it changes nothing and fails when either file is stale.
//
// A script after graphql-codegen, not a codegen plugin: the id hashes the exact text the board
// sends, which only exists once codegen has written generated.ts.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { operations } from "../src/operations";

const serverPath = new URL("../../server/src/trusted-documents.ts", import.meta.url);
const webPath = new URL("../src/document-ids.ts", import.meta.url);
const generatedNote =
  "// Generated from web/src/*.graphql by `pnpm --filter web codegen`. Do not edit.";
const listStart = "export const TRUSTED_DOCUMENTS: Readonly<Record<string, string>> = ";

const read = (path: URL) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
};

/** The documents the committed server file already trusts. */
function committedDocuments(source: string): Record<string, string> {
  const start = source.indexOf(listStart);
  if (start === -1) return {};
  const end = source.indexOf("\n};\n", start);
  return JSON.parse(source.slice(start + listStart.length, end + 2)) as Record<string, string>;
}

const sorted = (record: Record<string, string>) =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)));
const json = (value: unknown) => JSON.stringify(value, null, 2);

const current = Object.entries(operations()).map(([name, text]) => ({
  name,
  text,
  id: `sha256:${createHash("sha256").update(text).digest("hex")}`,
}));
const ids = Object.fromEntries(current.map(({ name, id }) => [name, id]));
const committedServer = read(serverPath);
const documents = sorted({
  ...committedDocuments(committedServer),
  ...Object.fromEntries(current.map(({ id, text }) => [id, text])),
});

const serverSource = `${generatedNote}
// Every board operation ever generated, by id: the only queries the server runs off localhost.
// Old ids stay so tabs still running an older bundle keep working; prune ones no tab can hold.

${listStart}${json(documents)};

/** The id each operation has now (web/src/document-ids.ts). */
export const CURRENT_DOCUMENT_IDS = ${json(ids)} as const;
`;
const webSource = `${generatedNote}
// Each operation's trusted-document id, by name: what the board sends instead of the query.

export const DOCUMENT_IDS = ${json(ids)} as const;
`;

if (process.argv.includes("--check")) {
  const stale = [
    committedServer !== serverSource && "server/src/trusted-documents.ts",
    read(webPath) !== webSource && "web/src/document-ids.ts",
  ].filter(Boolean);
  if (stale.length > 0) {
    console.error(`${stale.join(" and ")} stale. Run \`pnpm --filter web codegen\` and commit.`);
    process.exit(1);
  }
} else {
  writeFileSync(serverPath, serverSource);
  writeFileSync(webPath, webSource);
}
