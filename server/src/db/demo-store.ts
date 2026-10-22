// The demo's rules and hand-placed issues, kept in the visitor's own browser instead of D1. The
// demo workspace is shared, so writes keyed by its fixed ids would reach every visitor. Each
// request starts from the visitor's cookie, and a response that changed anything sets it again.
// A cookie rather than localStorage, because the board renders on the server: it arrives with
// the page load, and the client doesn't need to know it's in the demo.

import type { Overrides } from "../domain/matrix";
import {
  DEFAULT_RULES,
  NO_DUE_DATE,
  parseRules,
  QUADRANTS,
  type Quadrant,
  type QuadrantRules,
} from "../domain/quadrant";
import type { PlacementStore } from "../placements";

export const DEMO_COOKIE = "lw_demo";

/**
 * Browsers keep at most 4096 bytes a cookie, so anything longer was never ours. Writes stay well
 * under it: mutations only reach the demo's two teams and few dozen issues.
 */
const MAX_COOKIE_LENGTH = 4096;

/** The cookie's contents: what differs from the defaults. */
interface Saved {
  rules: Record<string, QuadrantRules>;
  overrides: Record<string, Quadrant>;
}

export class DemoStore implements PlacementStore {
  /** Whether anything changed since the cookie was read, so the response should set it. */
  changed = false;

  private constructor(
    private readonly savedRules: Map<string, QuadrantRules>,
    private readonly savedOverrides: Map<string, Quadrant>,
  ) {}

  /**
   * The visitor's demo, from their cookie. It comes from the client, so anything that isn't valid
   * rules or a quadrant is dropped, as if never set; a cookie that isn't ours at all is ignored.
   */
  static fromCookie(value: string | undefined): DemoStore {
    const json = value && value.length <= MAX_COOKIE_LENGTH ? parseJson(value) : null;
    const saved = isObject(json) ? json : {};
    const rules = new Map<string, QuadrantRules>();
    const overrides = new Map<string, Quadrant>();
    for (const [teamId, input] of entries(saved.rules)) {
      const parsed = parseSavedRules(input);
      if (parsed) rules.set(teamId, parsed);
    }
    for (const [issueId, quadrant] of entries(saved.overrides)) {
      if (QUADRANTS.includes(quadrant as Quadrant)) overrides.set(issueId, quadrant as Quadrant);
    }
    return new DemoStore(rules, overrides);
  }

  /** The cookie's new value. */
  cookie(): string {
    const saved: Saved = {
      rules: Object.fromEntries(this.savedRules),
      overrides: Object.fromEntries(this.savedOverrides),
    };
    return JSON.stringify(saved);
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
    this.savedRules.set(teamId, rules);
    this.changed = true;
  }

  async setOverride(issueId: string, quadrant: Quadrant): Promise<void> {
    this.savedOverrides.set(issueId, quadrant);
    this.changed = true;
  }

  async clearOverride(issueId: string): Promise<void> {
    this.changed = this.savedOverrides.delete(issueId) || this.changed;
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** A JSON object's entries, or none when it isn't one. */
function entries(value: unknown): [string, unknown][] {
  return isObject(value) ? Object.entries(value) : [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Saved rules as the mutation would have accepted them, else null. */
function parseSavedRules(input: unknown): QuadrantRules | null {
  if (!isObject(input)) return null;
  const { importantFrom, urgencyWindowDays, noDueDate } = input;
  // GraphQL's enum checks noDueDate on the way in; nothing has checked it here.
  if (!NO_DUE_DATE.includes(noDueDate as QuadrantRules["noDueDate"])) return null;
  if (typeof importantFrom !== "number" || typeof urgencyWindowDays !== "number") return null;
  const { rules } = parseRules({
    importantFrom,
    urgencyWindowDays,
    noDueDate: noDueDate as QuadrantRules["noDueDate"],
  });
  return rules ?? null;
}
