// The demo's rules and hand-placed issues, kept in the visitor's own browser instead of D1. The
// demo workspace is shared, so writes keyed by its fixed ids would reach every visitor. Each
// request starts from the visitor's cookie, and a response that changed anything sets it again.
// A cookie rather than localStorage, because the board renders on the server: it arrives with
// the page load. The client still has to call /graphql with `?demo=true`, and send mutations one
// at a time: two in flight start from the same cookie, and the last response wins. The cookie's
// format is in demo-cookie.ts.

import type { Overrides } from "../domain/matrix";
import { DEFAULT_RULES, type Quadrant, type QuadrantRules } from "../domain/quadrant";
import type { DemoAssignments } from "../linear/demo";
import type { PlacementStore } from "../placements";
import { decodeDemo, encodeDemo } from "./demo-cookie";

export class DemoStore implements PlacementStore, DemoAssignments {
  /** Whether anything changed since the cookie was read, so the response should set it. */
  changed = false;

  private constructor(
    private readonly savedRules: Map<string, QuadrantRules>,
    private readonly savedOverrides: Map<string, Quadrant>,
    private readonly savedAssignees: Map<string, string>,
  ) {}

  /**
   * The visitor's demo, from their cookie. It comes from the client, so anything that isn't valid
   * rules or a quadrant is dropped, as if never set; a cookie that isn't ours at all is ignored.
   */
  static fromCookie(value: string | undefined): DemoStore {
    const { rules, overrides, assignees } = decodeDemo(value);
    return new DemoStore(rules, overrides, assignees);
  }

  /** The cookie's new value. */
  cookie(): string {
    return encodeDemo({
      rules: this.savedRules,
      overrides: this.savedOverrides,
      assignees: this.savedAssignees,
    });
  }

  async rules(teamIds: readonly string[]): Promise<Map<string, QuadrantRules>> {
    return new Map(teamIds.map((id) => [id, this.savedRules.get(id) ?? DEFAULT_RULES]));
  }

  async overrides(issueIds: readonly string[]): Promise<Overrides> {
    const overrides = new Map<string, Quadrant>();
    for (const id of issueIds) {
      const quadrant = this.savedOverrides.get(id);
      if (quadrant) overrides.set(id, quadrant);
    }
    return overrides;
  }

  async setRules(teamId: string, rules: QuadrantRules): Promise<void> {
    // Back to the defaults is nothing to keep.
    const defaults = (Object.keys(DEFAULT_RULES) as (keyof QuadrantRules)[]).every(
      (key) => rules[key] === DEFAULT_RULES[key],
    );
    if (defaults) this.savedRules.delete(teamId);
    else this.savedRules.set(teamId, rules);
    this.changed = true;
  }

  async setOverride(issueId: string, quadrant: Quadrant): Promise<void> {
    this.savedOverrides.set(issueId, quadrant);
    this.changed = true;
  }

  assignee(issueId: string): string | undefined {
    return this.savedAssignees.get(issueId);
  }

  setAssignee(issueId: string, userId: string | null): void {
    if (userId === null) this.changed = this.savedAssignees.delete(issueId) || this.changed;
    else {
      this.savedAssignees.set(issueId, userId);
      this.changed = true;
    }
  }

  async clearOverride(issueId: string): Promise<void> {
    this.changed = this.savedOverrides.delete(issueId) || this.changed;
  }
}
