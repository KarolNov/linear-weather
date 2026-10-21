// Our own data, kept in D1 (Cloudflare's SQLite): how each team sorts issues, and the issues a
// PM placed by hand. Linear stays the source of truth for everything else.
// After changing a table, run `pnpm --filter server db:generate` and commit the migration.

import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { LinearPriority, Quadrant, QuadrantRules } from "../domain/quadrant";

/** One row per team that changed its rules; teams without one use DEFAULT_RULES. */
export const quadrantRules = sqliteTable(
  "quadrant_rules",
  {
    /** Linear's team id. */
    teamId: text("team_id").primaryKey(),
    importantFrom: integer("important_from").$type<Exclude<LinearPriority, 0>>().notNull(),
    urgencyWindowDays: integer("urgency_window_days").notNull(),
    noDueDate: text("no_due_date", { enum: ["urgent", "notUrgent"] })
      .$type<QuadrantRules["noDueDate"]>()
      .notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    check("important_from_is_a_priority", sql`${t.importantFrom} BETWEEN 1 AND 4`),
    check("urgency_window_is_positive", sql`${t.urgencyWindowDays} >= 1`),
    check("no_due_date_is_known", sql`${t.noDueDate} IN ('urgent', 'notUrgent')`),
  ],
);

/** An issue a PM moved by hand. It stays put whatever the rules say, until the override goes. */
export const quadrantOverride = sqliteTable(
  "quadrant_override",
  {
    /** Linear's issue id, which survives the issue moving teams. */
    issueId: text("issue_id").primaryKey(),
    quadrant: text("quadrant", { enum: ["do", "schedule", "delegate", "drop"] })
      .$type<Quadrant>()
      .notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [check("quadrant_is_known", sql`${t.quadrant} IN ('do', 'schedule', 'delegate', 'drop')`)],
);
