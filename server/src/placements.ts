// How one GraphQL request places issues: team rules and hand-placed issues from the store.
// Resolvers for every team and person on a page ask in the same tick, so DataLoader batches them
// into one query for rules and one for overrides, like Workspace does for Linear.

import DataLoader from "dataloader";
import type { Overrides } from "./domain/matrix";
import { DEFAULT_RULES, type Quadrant, type QuadrantRules } from "./domain/quadrant";

/** The part of the Store placing issues reads. */
export interface PlacementSource {
  rules(teamIds: readonly string[]): Promise<ReadonlyMap<string, QuadrantRules>>;
  overrides(issueIds: readonly string[]): Promise<Overrides>;
}

export class Placements {
  private readonly rulesLoader = new DataLoader<string, QuadrantRules>(async (teamIds) => {
    const rules = await this.read(() => this.source.rules(teamIds), new Map());
    return teamIds.map((id) => rules.get(id) ?? DEFAULT_RULES);
  });
  private readonly overrideLoader = new DataLoader<string, Quadrant | null>(async (issueIds) => {
    const overrides = await this.read(() => this.source.overrides(issueIds), new Map());
    return issueIds.map((id) => overrides.get(id) ?? null);
  });

  constructor(
    private readonly source: PlacementSource,
    private readonly log: (message: string, error: unknown) => void = console.error,
  ) {}

  rules(teamId: string): Promise<QuadrantRules> {
    return this.rulesLoader.load(teamId);
  }

  /** Which of these issues a PM placed by hand, and where. */
  async overrides(issues: readonly { id: string }[]): Promise<Overrides> {
    const quadrants = await this.overrideLoader.loadMany(issues.map((issue) => issue.id));
    const overrides = new Map<string, Quadrant>();
    issues.forEach(({ id }, i) => {
      const quadrant = quadrants[i];
      if (typeof quadrant === "string") overrides.set(id, quadrant);
    });
    return overrides;
  }

  /**
   * Linear still answers when our database doesn't, so the board falls back to the default rules
   * and no hand placements rather than going blank.
   */
  private async read<T>(load: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await load();
    } catch (error) {
      this.log("Couldn't read placements from D1; using the defaults", error);
      return fallback;
    }
  }
}
