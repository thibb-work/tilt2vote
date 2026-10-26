import { SESSION_SLUG, validOptions } from './constants.ts';
import type { SessionRow } from './types.ts';

/**
 * Turns a raw `sessions/<slug>` snapshot into a SessionRow.
 *
 * Postgres returned every column on every read, including explicit nulls. RTDB
 * drops a key whose value is null, so a reset round arrives with no
 * `frozen_tallies` and no `frozen_at` at all. Rather than teach each consumer
 * that absent and null mean the same thing, they are put back here.
 *
 * A snapshot without `options` is treated as no session: the node is either
 * missing or half-written, and the caller already renders a fallback round.
 * Pure and firebase-free so the normalising can be tested without a database.
 */
export function toSessionRow(value: unknown): SessionRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const row = value as Partial<SessionRow>;
  if (!validOptions(row.options)) return null;

  return {
    slug: typeof row.slug === 'string' ? row.slug : SESSION_SLUG,
    options: row.options,
    // Anything other than a literal true is not frozen. A missing flag on a
    // half-written node must not lock a round that nobody froze.
    frozen: row.frozen === true,
    frozen_tallies: row.frozen_tallies ?? null,
    frozen_at: row.frozen_at ?? null,
    round_started: row.round_started ?? '',
    updated_at: row.updated_at ?? '',
  };
}
