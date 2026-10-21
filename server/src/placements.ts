// How one GraphQL request places issues: each team's rules and its hand-placed issues, read
// from the store once and shared by every matrix on the board, like Workspace does for Linear.

import type { Overrides } from "./domain/matrix";
import type { QuadrantRules } from "./domain/quadrant";

/** The part of the Store placing issues reads. */
export interface PlacementSource {
  rules(teamId: string): Promise<QuadrantRules>;
  overrides(issueIds: readonly string[]): Promise<Overrides>;
}

export class Placements {
  private readonly rulesLoads = new Map<string, Promise<QuadrantRules>>();
  private readonly overrideLoads = new Map<string, Promise<Overrides>>();

  constructor(private readonly source: PlacementSource) {}

  rules(teamId: string): Promise<QuadrantRules> {
    return memo(this.rulesLoads, teamId, () => this.source.rules(teamId));
  }

  /**
   * Overrides among a team's open issues, looked up all at once the first time anyone on the
   * team needs them. Pass the whole team's issues, not one person's.
   */
  overrides(teamId: string, teamIssues: readonly { id: string }[]): Promise<Overrides> {
    return memo(this.overrideLoads, teamId, () =>
      this.source.overrides(teamIssues.map((issue) => issue.id)),
    );
  }
}

function memo<T>(loads: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let loading = loads.get(key);
  if (!loading) {
    loading = load();
    loads.set(key, loading);
  }
  return loading;
}
