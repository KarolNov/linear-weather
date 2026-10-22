// Our own data, kept in D1 (Cloudflare's SQLite): how each team sorts issues, and the issues a
// PM placed by hand. Linear stays the source of truth for everything else.
// After changing a table, run `pnpm --filter server db:generate` and commit the migration.

import { type SQL, sql } from "drizzle-orm";
import { check, integer, type SQLiteColumn, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  type LinearPriority,
  MAX_URGENCY_WINDOW_DAYS,
  NO_DUE_DATE,
  QUADRANTS,
} from "../domain/quadrant";

/** One row per team that changed its rules; teams without one use DEFAULT_RULES. */
export const quadrantRules = sqliteTable(
  "quadrant_rules",
  {
    /** Linear's team id. */
    teamId: text("team_id").primaryKey(),
    importantFrom: integer("important_from").$type<Exclude<LinearPriority, 0>>().notNull(),
    urgencyWindowDays: integer("urgency_window_days").notNull(),
    noDueDate: text("no_due_date", { enum: NO_DUE_DATE }).notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    check(
      "important_from_is_a_priority",
      sql`${isInteger(t.importantFrom)} AND ${t.importantFrom} BETWEEN 1 AND 4`,
    ),
    check(
      "urgency_window_in_range",
      // DDL can't bind parameters; the bound is our own constant.
      sql`${isInteger(t.urgencyWindowDays)} AND ${t.urgencyWindowDays} BETWEEN 1 AND ${sql.raw(String(MAX_URGENCY_WINDOW_DAYS))}`,
    ),
    check("no_due_date_is_known", oneOf(t.noDueDate, NO_DUE_DATE)),
  ],
);

/** An issue a PM moved by hand. It stays put whatever the rules say, until the override goes. */
export const quadrantOverride = sqliteTable(
  "quadrant_override",
  {
    /** Linear's issue id, which survives the issue moving teams. */
    issueId: text("issue_id").primaryKey(),
    quadrant: text("quadrant", { enum: QUADRANTS }).notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [check("quadrant_is_known", oneOf(t.quadrant, QUADRANTS))],
);

/** SQLite's INTEGER columns still keep 1.5 as a REAL, which GraphQL's Int can't send. */
function isInteger(column: SQLiteColumn): SQL {
  return sql`typeof(${column}) = 'integer'`;
}

/** A CHECK's `IN (…)`, written out: DDL can't bind parameters. The values are our own constants. */
function oneOf(column: SQLiteColumn, values: readonly string[]): SQL {
  return sql`${column} IN (${sql.raw(values.map((v) => `'${v}'`).join(", "))})`;
}
