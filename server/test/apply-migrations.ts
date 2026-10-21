import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { getTableName } from "drizzle-orm";
import { afterEach } from "vitest";
import * as tables from "../src/db/tables";

// Every test starts from the migrated, empty database, as a fresh deploy would. Storage
// outlives a test, so empty each table after it.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

afterEach(async () => {
  await env.DB.batch(
    Object.values(tables).map((table) => env.DB.prepare(`DELETE FROM ${getTableName(table)}`)),
  );
});
