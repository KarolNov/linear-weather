// Team rules and hand-placed issues, kept in D1. Linear knows nothing about either.

import { eq, inArray } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import type { Overrides } from "../domain/matrix";
import { DEFAULT_RULES, type Quadrant, type QuadrantRules } from "../domain/quadrant";
import { quadrantOverride, quadrantRules } from "./tables";

/** D1 binds at most 100 parameters per statement. */
const MAX_PARAMS = 100;

export class Store {
  private readonly db: DrizzleD1Database;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  /** The team's rules, or the defaults until it changes them. */
  async rules(teamId: string): Promise<QuadrantRules> {
    const [row] = await this.db
      .select({
        importantFrom: quadrantRules.importantFrom,
        urgencyWindowDays: quadrantRules.urgencyWindowDays,
        noDueDate: quadrantRules.noDueDate,
      })
      .from(quadrantRules)
      .where(eq(quadrantRules.teamId, teamId));
    return row ?? DEFAULT_RULES;
  }

  async setRules(teamId: string, rules: QuadrantRules): Promise<void> {
    const row = { ...rules, updatedAt: new Date().toISOString() };
    await this.db
      .insert(quadrantRules)
      .values({ teamId, ...row })
      .onConflictDoUpdate({ target: quadrantRules.teamId, set: row });
  }

  /** Which of these issues a PM placed by hand, and where. One round trip however many. */
  async overrides(issueIds: readonly string[]): Promise<Overrides> {
    const ids = [...new Set(issueIds)];
    if (ids.length === 0) return new Map();
    const select = (chunk: string[]) =>
      this.db
        .select({ issueId: quadrantOverride.issueId, quadrant: quadrantOverride.quadrant })
        .from(quadrantOverride)
        .where(inArray(quadrantOverride.issueId, chunk));
    type Query = ReturnType<typeof select>;
    // Never empty: there's at least one id.
    const queries = chunks(ids, MAX_PARAMS).map(select) as [Query, ...Query[]];
    const results = await this.db.batch(queries);
    return new Map(results.flat().map((row) => [row.issueId, row.quadrant]));
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
}

function chunks<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}
