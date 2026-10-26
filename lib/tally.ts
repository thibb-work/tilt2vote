import { WEDGE_COUNT, headingToWedge } from './tilt.ts';
import type { PhoneReading } from './dots.ts';

/** jsonb comes back keyed by stringified wedge index. */
export function talliesToCounts(tallies: Record<string, number> | null | undefined, optionCount = WEDGE_COUNT): number[] {
  const counts = new Array<number>(optionCount).fill(0);
  if (!tallies) return counts;
  for (let w = 0; w < optionCount; w++) counts[w] = Number(tallies[String(w)] ?? 0);
  return counts;
}

export function countsToTallies(counts: number[]): Record<string, number> {
  return Object.fromEntries(counts.map((c, w) => [String(w), c]));
}

/** Indices sharing the top count. Empty when nobody voted. */
export function leaders(counts: number[]): number[] {
  const max = Math.max(...counts);
  if (max <= 0) return [];
  return counts.flatMap((c, w) => (c === max ? [w] : []));
}

/**
 * Fold live phone positions into the configured counts. A phone lying flat is present but
 * aiming at nothing, so it raises the room total without landing in a wedge --
 * abstaining has to be distinguishable from having left.
 */
export function countsFrom(readings: PhoneReading[], optionCount = WEDGE_COUNT): number[] {
  const counts = new Array<number>(optionCount).fill(0);
  for (const r of readings) {
    if (r.heading === null) continue;
    const w = headingToWedge(r.heading, optionCount);
    if (w >= 0 && w < optionCount) counts[w]++;
  }
  return counts;
}

/** Nobody is running a round with more phones than this; anything larger is not a tally. */
export const MAX_TALLY_COUNT = 10_000;

/**
 * Validate a tally posted by the host's browser before it reaches Postgres.
 *
 * This is the only path where client-supplied data is stored, and it lands in a
 * jsonb column that is read straight back out onto the projector. Unchecked, a
 * malformed body puts NaN on the results screen and an unbounded one bloats the
 * row, so the shape is pinned here: one key per option, finite non-negative integers.
 */
export function parseTallies(input: unknown, optionCount = WEDGE_COUNT): Record<string, number> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > optionCount) return null;

  const out: Record<string, number> = {};
  for (let w = 0; w < optionCount; w++) out[String(w)] = 0;

  for (const [key, value] of entries) {
    const w = Number(key);
    if (!Number.isInteger(w) || w < 0 || w >= optionCount) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (!Number.isInteger(value) || value < 0 || value > MAX_TALLY_COUNT) return null;
    out[String(w)] = value;
  }

  return out;
}
