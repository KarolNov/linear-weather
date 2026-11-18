// Writes the board's operations, by id, to server/src/trusted-documents.ts: the only queries the
// server runs off localhost. With --check it changes nothing and fails when that file is stale.
//
// A script after graphql-codegen, not a codegen plugin: the id hashes the exact text the board
// sends, which only exists once codegen has written generated.ts.

import { readFileSync, writeFileSync } from "node:fs";
import { trustedDocuments } from "../src/operations";

const path = new URL("../../server/src/trusted-documents.ts", import.meta.url);
const header = `// Generated from web/src/*.graphql by \`pnpm --filter web codegen\`. Do not edit.
// The board's operations by id (web/src/document-id.ts): the only queries the server runs off
// localhost.
`;
const body = `export const TRUSTED_DOCUMENTS: Readonly<Record<string, string>> = ${JSON.stringify(
  await trustedDocuments(),
  null,
  2,
)};\n`;
const source = `${header}\n${body}`;

if (process.argv.includes("--check")) {
  let committed = "";
  try {
    committed = readFileSync(path, "utf8");
  } catch {}
  if (committed !== source) {
    console.error(
      "server/src/trusted-documents.ts is stale. Run `pnpm --filter web codegen` and commit it.",
    );
    process.exit(1);
  }
} else {
  writeFileSync(path, source);
}
