export const SESSION_SLUG = 'main';
export const ROOM_CHANNEL = 'tilt-room';

/** One saturated hue per wedge, ordered clockwise from the top. */
export const WEDGE_COLORS = [
  '#FF3B6B',
  '#FF9F1C',
  '#FFE347',
  '#3DDC84',
  '#22D3EE',
  '#A78BFA',
  '#F472B6',
  '#FB7185',
  '#A3E635',
  '#2DD4BF',
  '#60A5FA',
  '#C084FC',
] as const;

export const FALLBACK_OPTIONS = [
  'Cool data collection',
  'Bulk PDF editor',
  'Dynamic concept explainer',
  'Interactive slides',
  'Animated website',
  'Automated data extraction',
];

/**
 * How often a phone republishes where it is pointing, and therefore how long a
 * dot on the host has before the next position arrives.
 *
 * It lives here because the host's easing has to be the same number. A shorter
 * ease makes the dots stutter -- arrive, stop, wait -- and a longer one piles
 * lag on top of lag, so globals.css reads it from --dot-travel rather than
 * carrying a second copy that can drift.
 *
 * It was 300ms because Supabase Realtime Presence, the transport this app used
 * to run on, capped out around twenty messages a second. RTDB has no such
 * ceiling and the database sits in europe-west1, a 15ms round trip away, so the
 * cap outlived the only reason it existed.
 */
export const PUBLISH_INTERVAL_MS = 100;

/** Longest option label the dial can render without the text overrunning its wedge. */
export const MAX_OPTION_LEN = 48;

/** Keep wedges large enough to label and aim at on a phone. */
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = WEDGE_COLORS.length;

export function isOptionCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_OPTIONS && value <= MAX_OPTIONS;
}

export function validOptions(value: unknown): value is string[] {
  return Array.isArray(value) && isOptionCount(value.length) && value.every(
    (label) => typeof label === 'string' && label.trim().length > 0 && label.trim().length <= MAX_OPTION_LEN,
  );
}
