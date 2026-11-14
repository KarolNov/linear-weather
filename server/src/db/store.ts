// Team rules, hand-placed issues and people's capacity, kept in D1. Linear knows nothing of them.

import { eq, sql } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { FULL_TIME } from "../domain/capacity";
import type { Overrides } from "../domain/matrix";
import { DEFAULT_RULES, type Quadrant, type QuadrantRules } from "../domain/quadrant";
import { memberCapacity, quadrantOverride, quadrantRules } from "./tables";

export class Store {
  private readonly db: DrizzleD1Database;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  /** Each team's rules, or the defaults for a team that never changed them. */
  async rules(teamIds: readonly string[]): Promise<Map<string, QuadrantRules>> {
    const rows = await this.db
      .select({
        teamId: quadrantRules.teamId,
        importantFrom: quadrantRules.importantFrom,
        urgencyWindowDays: quadrantRules.urgencyWindowDays,
        noDueDate: quadrantRules.noDueDate,
        dropAlertPercent: quadrantRules.dropAlertPercent,
      })
      .from(quadrantRules)
      .where(inIds(quadrantRules.teamId, teamIds));
    const stored = new Map(rows.map(({ teamId, ...rules }) => [teamId, rules]));
    return new Map(teamIds.map((id) => [id, stored.get(id) ?? DEFAULT_RULES]));
  }

  async setRules(teamId: string, rules: QuadrantRules): Promise<void> {
    const row = { ...rules, updatedAt: new Date().toISOString() };
    await this.db
      .insert(quadrantRules)
      .values({ teamId, ...row })
      .onConflictDoUpdate({ target: quadrantRules.teamId, set: row });
  }

  /** Which of these issues a PM placed by hand, and where. */
  async overrides(issueIds: readonly string[]): Promise<Overrides> {
    if (issueIds.length === 0) return new Map();
    const rows = await this.db
      .select({ issueId: quadrantOverride.issueId, quadrant: quadrantOverride.quadrant })
      .from(quadrantOverride)
      .where(inIds(quadrantOverride.issueId, issueIds));
    return new Map(rows.map((row) => [row.issueId, row.quadrant]));
  }

  async setOverride(issueId: string, quadrant: Quadrant): Promise<void> {
    const row = { quadrant, updatedAt: new Date().toISOString() };
    await this.db
      .insert(quadrantOverride)
      .values({ issueId, ...row })
      .onConflictDoUpdate({ target: quadrantOverride.issueId, set: row });
  }

  /** Hands the issue back to the rules. */
  async clearOverride(issueId: string): Promise<void> {
    await this.db.delete(quadrantOverride).where(eq(quadrantOverride.issueId, issueId));
  }

  /** The capacity of whichever of these people don't work full time. */
  async capacities(userIds: readonly string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.db
      .select({ userId: memberCapacity.userId, factor: memberCapacity.factor })
      .from(memberCapacity)
      .where(inIds(memberCapacity.userId, userIds));
    return new Map(rows.map((row) => [row.userId, row.factor]));
  }

  /** How much of a full-time week someone works. Full time is nothing to keep. */
  async setCapacity(userId: string, factor: number): Promise<void> {
    if (factor === FULL_TIME) {
      await this.db.delete(memberCapacity).where(eq(memberCapacity.userId, userId));
      return;
    }
    const row = { factor, updatedAt: new Date().toISOString() };
    await this.db
      .insert(memberCapacity)
      .values({ userId, ...row })
      .onConflictDoUpdate({ target: memberCapacity.userId, set: row });
  }
}

/**
 * `column IN (…ids)` as one JSON parameter. D1 binds at most 100 parameters per statement, and a
 * team can have thousands of open issues; this stays one statement however many.
 */
function inIds(column: SQLiteColumn, ids: readonly string[]) {
  return sql`${column} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`;
}
