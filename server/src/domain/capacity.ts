// How much of a full-time week someone works: 1 for full time, 0.5 for half. Weather compares
// each person's urgent load with their fair share, which scales with it.

/** Anyone without a capacity set works full time. */
export const FULL_TIME = 1;

/**
 * A capacity from a client: more than 0 and at most full time, kept to hundredths (a whole
 * percent), so what's stored is what the board shows.
 */
export function parseCapacity(factor: number): { factor: number } | { problem: string } {
  const rounded = Math.round(factor * 100) / 100;
  if (!Number.isFinite(rounded) || rounded <= 0 || rounded > FULL_TIME) {
    return { problem: "Capacity is a share of full time: more than 0, up to 1." };
  }
  return { factor: rounded };
}

/** E.g. "full time", "half time" or "60% time". */
export function describeCapacity(factor: number): string {
  if (factor === FULL_TIME) return "full time";
  if (factor === 0.5) return "half time";
  return `${Math.round(factor * 100)}% time`;
}
