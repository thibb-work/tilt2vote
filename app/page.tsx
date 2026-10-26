'use client';

import { useEffect, useRef, useState } from 'react';
import { ActivateGate } from '@/components/ActivateGate';
import { Dial } from '@/components/Dial';
import { WinnerVeil } from '@/components/WinnerVeil';
import { FALLBACK_OPTIONS } from '@/lib/constants';
import { createTiltTracker, type TiltReading } from '@/lib/tilt';
import { talliesToCounts } from '@/lib/tally';
import { useRoom } from '@/lib/useRoom';
import { isRoomId, ROOM_QUERY_KEY } from '@/lib/room';
import { useClientValue } from '@/lib/useClientValue';
import { useSession } from '@/lib/useSession';

const FLAT: TiltReading = { wedge: null, magnitude: 0, heading: null };

export default function VotePage() {
  const session = useSession();
  const options = session?.options ?? FALLBACK_OPTIONS;

  // The room id arrives in the QR link and nowhere else, so a phone that did not
  // scan has no path to write to. Read it straight off the URL rather than
  // through useSearchParams, which would force this page out of static rendering.
  const roomId = useClientValue(
    () => new URLSearchParams(window.location.search).get(ROOM_QUERY_KEY),
    null as string | null,
  );
  const joined = isRoomId(roomId) ? roomId : null;

  const room = useRoom({ role: 'voter', roomId: joined, optionCount: options.length });

  const [active, setActive] = useState(false);
  const [reading, setReading] = useState<TiltReading>(FLAT);

  const tracker = useRef(createTiltTracker());
  const latest = useRef<TiltReading>(FLAT);

  useEffect(() => {
    if (!active) return;

    const onOrientation = (event: DeviceOrientationEvent) => {
      latest.current = tracker.current.update({ beta: event.beta, gamma: event.gamma }, options.length);
    };
    window.addEventListener('deviceorientation', onOrientation, true);

    // Sensors fire faster than the screen repaints, and re-rendering on every
    // sample makes the dial stutter. Sample once per frame, and only commit
    // state when something moved enough to be visible.
    let frame = 0;
    const tick = () => {
      setReading((prev) => {
        const next = latest.current;
        const sameHeading =
          prev.heading === null && next.heading === null
            ? true
            : prev.heading !== null &&
              next.heading !== null &&
              Math.abs(prev.heading - next.heading) < 0.8;

        if (prev.wedge === next.wedge && sameHeading && Math.abs(prev.magnitude - next.magnitude) < 0.5) {
          return prev;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('deviceorientation', onOrientation, true);
      cancelAnimationFrame(frame);
    };
  }, [active, options.length]);

  const { publish } = room;
  const frozen = session?.frozen ?? false;

  // Keep streaming while the round is open, whatever the phone is doing. A
  // phone never commits to anything -- it is a live pointer until the host
  // freezes, and freezing is what turns the last position into a vote.
  useEffect(() => {
    if (!active || frozen) return;
    publish(reading.heading, reading.magnitude);
  }, [active, frozen, reading.heading, reading.magnitude, publish]);

  if (!joined) {
    return (
      <main className="stage">
        <div className="gate">
          <h1>Scan to join</h1>
          <p>
            This round has its own join link. Point your camera at the QR code on the
            main screen to take part.
          </p>
          {/* Without this, opening the bare URL is a dead end and the product
              looks broken to anyone who simply followed the link. */}
          <a className="gate-link" href="/demo">
            Or try it without a round &rarr;
          </a>
        </div>
      </main>
    );
  }

  if (!active) {
    return (
      <main className="stage">
        <ActivateGate onReady={() => setActive(true)} />
      </main>
    );
  }

  const frozenCounts = talliesToCounts(session?.frozen_tallies, options.length);
  const aiming = reading.wedge !== null ? options[reading.wedge] : null;

  // Writing into a room no host screen is reading. The dial still works and the
  // socket is fine, so nothing else on this page would give it away -- and the
  // one person who can fix it is holding this phone.
  const orphaned = room.watch === 'orphaned' && !frozen;

  return (
    <main className="stage">
      <div className="dial-wrap">
        <Dial
          options={options}
          counts={frozen ? frozenCounts : room.counts}
          active={reading.wedge}
          heading={reading.heading}
          magnitude={reading.magnitude}
          total={room.total}
          showCounts
        />
      </div>

      <div className="status-line">
        <span className={`dot${room.status === 'live' && !orphaned && !room.fault ? '' : ' is-off'}`} />
        {room.status !== 'live'
          ? 'Reconnecting'
          : frozen
            ? 'Round closed'
            : // A refused write is its own failure: the socket is up, the host
              // is answering, and this phone alone is not in the count. Nothing
              // else on this screen would differ.
              room.fault
              ? 'Not being counted'
              : orphaned
                ? 'Waiting for the host screen'
                : aiming
                  ? `Aiming at ${aiming}`
                  : 'Level — aiming at nothing'}
      </div>

      {!frozen &&
        (room.fault ? (
          // Rescanning is the fix when the room is simply unread. It is the
          // wrong advice when this phone's own writes are being refused, so the
          // database's own reason comes first.
          <p className="status-hint is-warn">{room.fault}</p>
        ) : orphaned ? (
          <p className="status-hint is-warn">
            Nobody is reading this room. Scan the QR code on the main screen again — and
            check that screen says it is connected.
          </p>
        ) : (
          <p className="status-hint">
            Tilt freely. The host closes the round from the main screen.
          </p>
        ))}

      {frozen && <WinnerVeil options={options} counts={frozenCounts} />}
    </main>
  );
}
