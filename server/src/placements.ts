// How one GraphQL request places issues and weighs load: team rules, hand-placed issues and
// people's capacity from the store. Resolvers for every team and person on a page ask in the same
// tick, so DataLoader batches them into one query for each, like Workspace does for Linear. Writes go
// through here too, so the rest of a mutation's response reads what it just wrote.

import DataLoader from "dataloader";
import { FULL_TIME } from "./domain/capacity";
import type { Overrides } from "./domain/matrix";
import { DEFAULT_RULES, type Quadrant, type QuadrantRules } from "./domain/quadrant";

/** The part of the Store placing issues reads. */
export interface PlacementSource {
  rules(teamIds: readonly string[]): Promise<ReadonlyMap<string, QuadrantRules>>;
  overrides(issueIds: readonly string[]): Promise<Overrides>;
  /** The capacity of whichever of these people don't work full time. */
  capacities(userIds: readonly string[]): Promise<ReadonlyMap<string, number>>;
}

/** The Store as placing issues reads and changes it. */
export interface PlacementStore extends PlacementSource {
  setRules(teamId: string, rules: QuadrantRules): Promise<void>;
  setOverride(issueId: string, quadrant: Quadrant): Promise<void>;
  clearOverride(issueId: string): Promise<void>;
  /** How much of a full-time week someone works; FULL_TIME forgets it. */
  setCapacity(userId: string, factor: number): Promise<void>;
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
  private readonly capacityLoader = new DataLoader<string, number>(async (userIds) => {
    const capacities = await this.read(() => this.source.capacities(userIds), new Map());
    return userIds.map((id) => capacities.get(id) ?? FULL_TIME);
  });

  constructor(
    private readonly source: PlacementStore,
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

  /** How much of a full-time week someone works: 1 unless set. */
  capacity(userId: string): Promise<number> {
    return this.capacityLoader.load(userId);
  }

  async setCapacity(userId: string, factor: number): Promise<void> {
    await this.source.setCapacity(userId, factor);
    this.capacityLoader.clear(userId).prime(userId, factor);
  }

  async setRules(teamId: string, rules: QuadrantRules): Promise<void> {
    await this.source.setRules(teamId, rules);
    this.rulesLoader.clear(teamId).prime(teamId, rules);
  }

  /** Places an issue by hand, or with null hands it back to the rules. */
  async setOverride(issueId: string, quadrant: Quadrant | null): Promise<void> {
    if (quadrant) await this.source.setOverride(issueId, quadrant);
    else await this.source.clearOverride(issueId);
    this.overrideLoader.clear(issueId).prime(issueId, quadrant);
  }

  /**
   * Linear still answers when our database doesn't, so the board falls back to the default rules,
   * no hand placements and everyone full time rather than going blank.
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
