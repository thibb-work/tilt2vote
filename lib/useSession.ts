'use client';

import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { roomAuth, roomDb } from './firebase/client';
import { SESSION_SLUG } from './constants';
import { toSessionRow } from './session';
import type { SessionRow } from './types';

/**
 * The labels and the frozen flag, live. A freeze on the host screen lands on
 * every phone through an RTDB listener without anyone refreshing.
 *
 * This used to watch postgres_changes on the sessions table. The node it reads
 * now is server-written: the rules give every signed-in client read and refuse
 * them all write, so a phone sees the round exactly as before but still cannot
 * freeze or relabel it.
 */

export function useSession(): SessionRow | null {
  const [session, setSession] = useState<SessionRow | null>(null);

  useEffect(() => {
    let alive = true;
    let stop: (() => void) | undefined;

    let retry: ReturnType<typeof setTimeout> | undefined;

    const retrySubscription = () => {
      if (!alive) return;
      stop?.();
      stop = undefined;
      clearTimeout(retry);
      retry = setTimeout(subscribe, 3000);
    };

    // Both the room connection and the round listener need to recover after a
    // refused first sign-in. Recovering only the room lets a phone vote while
    // silently missing every later lock, reopen, and option change.
    const subscribe = () => {
      void roomAuth()
        .then(() => {
          if (!alive) return;
          stop = onValue(
            ref(roomDb(), `sessions/${SESSION_SLUG}`),
            (snap) => {
              if (alive) setSession(toSessionRow(snap.val()));
            },
            retrySubscription,
          );
        })
        .catch(retrySubscription);
    };
    subscribe();

    return () => {
      alive = false;
      clearTimeout(retry);
      stop?.();
    };
  }, []);

  return session;
}
