import { defineConfig } from "drizzle-kit";

// Generates the SQL migrations that `wrangler d1 migrations apply` runs.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/tables.ts",
  out: "./migrations",
});
