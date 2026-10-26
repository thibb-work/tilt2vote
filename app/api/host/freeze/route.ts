import { NextResponse } from 'next/server';
import { isHost, sameOrigin } from '@/lib/hostAuth';
import { freeze } from '@/lib/firebase/session';
import { isOptionCount } from '@/lib/constants';
import { parseTallies } from '@/lib/tally';

/**
 * Tallies come from the host's browser, which is the only place the live
 * positions are folded together. The cookie says who is asking; parseTallies
 * says whether what they sent is a tally at all.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
  }
  if (!(await isHost())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { tallies?: unknown; optionCount?: unknown };
  const optionCount = body.optionCount ?? 6;
  const tallies = isOptionCount(optionCount) ? parseTallies(body.tallies, optionCount) : null;
  if (!tallies) {
    return NextResponse.json({ error: 'Malformed tallies' }, { status: 400 });
  }

  try {
    await freeze(tallies);
  } catch (error) {
    // Driver messages name paths and credentials. The host has no use for that
    // on a projector, and it is free reconnaissance if the screen is
    // photographed, so it stays in the server log.
    console.error(`${new URL(request.url).pathname} failed:`, error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
