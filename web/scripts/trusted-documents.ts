// Works out each board operation's trusted-document id and writes:
// - server/src/trusted-documents.ts: the documents the server runs off localhost, by id, and the
//   current id of each operation. The list only grows: a tab still running an older bundle sends
//   an older id, which has to keep working after the next deploy.
// - web/src/document-ids.ts: each operation's current id, by name, which the board sends.
// With --check it changes nothing and fails when either file is stale.
// With --prune [ref] it also drops every id except the current ones and the ones current at
// `ref` (default origin/main), the bundle that's live. Run it on a branch, before merging: the
// tabs a deploy leaves open hold the live bundle's ids, not older ones.
//
// A script after graphql-codegen, not a codegen plugin: the id hashes the exact text the board
// sends, which only exists once codegen has written generated.ts.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { operations } from "../src/operations";

const serverPath = new URL("../../server/src/trusted-documents.ts", import.meta.url);
const webPath = new URL("../src/document-ids.ts", import.meta.url);
const generatedNote =
  "// Generated from web/src/*.graphql by `pnpm --filter web codegen`. Do not edit.";
const listStart = "export const TRUSTED_DOCUMENTS: Readonly<Record<string, string>> = ";
const idsStart = "export const CURRENT_DOCUMENT_IDS = ";

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

/** The ids a committed server file names as current. */
function committedIds(source: string): string[] {
  const start = source.indexOf(idsStart);
  if (start === -1) return [];
  const end = source.indexOf(" as const;", start);
  return Object.values(
    JSON.parse(source.slice(start + idsStart.length, end)) as Record<string, string>,
  );
}

/** The server file as committed at a git ref. */
function serverAt(ref: string): string {
  const path = "server/src/trusted-documents.ts";
  const root = new URL("../../", import.meta.url);
  return execFileSync("git", ["show", `${ref}:${path}`], { cwd: root, encoding: "utf8" });
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
const pruneAt = process.argv.indexOf("--prune");
const committed = committedDocuments(committedServer);
const kept =
  pruneAt === -1
    ? committed
    : Object.fromEntries(
        committedIds(serverAt(process.argv[pruneAt + 1] ?? "origin/main")).flatMap((id) => {
          const text = committed[id];
          return text === undefined ? [] : [[id, text]];
        }),
      );
const documents = sorted({
  ...kept,
  ...Object.fromEntries(current.map(({ id, text }) => [id, text])),
});

const serverSource = `${generatedNote}
// Every board operation ever generated, by id: the only queries the server runs off localhost.
// Old ids stay so tabs still running an older bundle keep working.
// \`pnpm --filter web codegen:prune\` keeps just the current ids and the live bundle's.

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
