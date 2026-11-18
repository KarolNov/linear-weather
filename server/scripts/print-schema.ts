// Prints our schema (src/schema.ts) as SDL to schema.graphql, which web's codegen types its
// operations against. With --check it changes nothing and fails when schema.graphql is stale.
//
// A script rather than a codegen output: codegen can't load src/schema.ts (its imports have no
// extensions), and printing it inside codegen.ts would mix two copies of graphql.

import { readFileSync, writeFileSync } from "node:fs";
import { lexicographicSortSchema, printSchema } from "graphql";
import { schema } from "../src/schema";

const path = new URL("../schema.graphql", import.meta.url);
const header = "# Generated from src/schema.ts by `pnpm --filter server codegen`. Do not edit.\n\n";
const sdl = `${header}${printSchema(lexicographicSortSchema(schema))}\n`;

if (process.argv.includes("--check")) {
  let committed = "";
  try {
    committed = readFileSync(path, "utf8");
  } catch {}
  if (committed !== sdl) {
    console.error("schema.graphql is stale. Run `pnpm --filter server codegen` and commit it.");
    process.exit(1);
  }
} else {
  writeFileSync(path, sdl);
}
