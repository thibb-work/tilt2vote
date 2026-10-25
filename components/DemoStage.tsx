'use client';

import { useEffect, useRef, useState } from 'react';
import { Dial } from './Dial';
import { FALLBACK_OPTIONS } from '@/lib/constants';
import { countsFrom } from '@/lib/tally';
import { DEAD_ZONE_DEG, createTiltTracker, headingToWedge } from '@/lib/tilt';
import {
  createSimRoom,
  pointerToReading,
  stepSimRoom,
  toReadings,
  SIM_PHONE_COUNT,
  type SimPhone,
} from '@/lib/demoRoom';
import { useClientValue } from '@/lib/useClientValue';

/** Slow enough that a phone visibly travels between wedges rather than snapping. */
const STEP_MS = 120;

type PermissionCapableEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

interface Aim {
  heading: number | null;
  magnitude: number;
}

const LEVEL: Aim = { heading: null, magnitude: 0 };

/**
 * The self-serve demo.
 *
 * Opening tilt2vote.vercel.app without a QR code shows a "Scan to join" wall,
 * which makes a working product look broken to anyone who just followed the
 * link. This is the answer to that: a dial that is already moving, and a needle
 * the visitor drives themselves.
 *
 * It works on a laptop by design. The people this page exists for have usually
 * just opened the URL on whatever they were already using, and a gyroscope gate
 * would send them straight back to the same dead end -- so a pointer drives the
 * needle, and a real tilt takes over wherever the hardware offers one.
 *
 * The surrounding phones are simulated and the page says so. Nothing here
 * touches Firebase or Supabase.
 */
export function DemoStage() {
  const [phones, setPhones] = useState<SimPhone[]>([]);
  const [aim, setAim] = useState<Aim>(LEVEL);
  const [tilting, setTilting] = useState(false);

  // The room runs from the start, because an empty dial is exactly the dead end
  // this page exists to fix. Taking tilt deliberately turns it off: someone
  // learning what their own phone does should not have to pick their needle out
  // of eleven other dots.
  const [simulating, setSimulating] = useState(true);

  const tracker = useRef(createTiltTracker());

  // Only iOS gates the sensor behind a gesture; everywhere else the probe below
  // picks tilt up on its own, so the button would be a dead control.
  const canAskForTilt = useClientValue(
    () =>
      typeof (window.DeviceOrientationEvent as PermissionCapableEvent | undefined)
        ?.requestPermission === 'function',
    false,
  );

  // The room is built on the first tick rather than at mount: it is seeded from
  // Math.random and Date.now, and a server render cannot produce the same one.
  useEffect(() => {
    if (!simulating) return;
    const id = setInterval(
      () => setPhones((prev) => (prev.length ? stepSimRoom(prev) : createSimRoom())),
      STEP_MS,
    );
    return () => clearInterval(id);
  }, [simulating]);

  // iOS will not deliver orientation without a gesture, so there it stays on the
  // pointer until someone asks for tilt. Everywhere else, the first real sample
  // takes over on its own -- a phone should not have to be told it is a phone.
  // That path leaves the room running: it is not a deliberate act, and a room
  // that vanished a moment after landing would just look like a glitch.
  useEffect(() => {
    if (tilting) return;
    const Orientation = window.DeviceOrientationEvent as PermissionCapableEvent | undefined;
    if (!Orientation || typeof Orientation.requestPermission === 'function') return;

    const probe = (event: DeviceOrientationEvent) => {
      if (event.beta !== null || event.gamma !== null) setTilting(true);
    };
    window.addEventListener('deviceorientation', probe, true);
    return () => window.removeEventListener('deviceorientation', probe, true);
  }, [tilting]);

  useEffect(() => {
    if (!tilting) return;
    const onOrientation = (event: DeviceOrientationEvent) => {
      const next = tracker.current.update({ beta: event.beta, gamma: event.gamma });
      setAim({ heading: next.heading, magnitude: next.magnitude });
    };
    window.addEventListener('deviceorientation', onOrientation, true);
    return () => window.removeEventListener('deviceorientation', onOrientation, true);
  }, [tilting]);

  async function askForTilt() {
    const Orientation = window.DeviceOrientationEvent as PermissionCapableEvent | undefined;
    if (typeof Orientation?.requestPermission !== 'function') return;
    try {
      if ((await Orientation.requestPermission()) !== 'granted') return;
      setTilting(true);
      // Clear the dial down to just this phone, so the first thing someone sees
      // after granting motion access is their own tilt and nothing else.
      setSimulating(false);
    } catch {
      // Denied or unavailable: the pointer still works, so there is nothing to say.
    }
  }

  function aimAtPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (tilting) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    const { heading, magnitude } = pointerToReading(
      event.clientX - (rect.left + rect.width / 2),
      event.clientY - (rect.top + rect.height / 2),
      radius,
    );
    // The same dead zone the real dial uses, so the demo teaches the real thing:
    // near the hub you are present but aiming at nothing.
    setAim({ heading: magnitude < DEAD_ZONE_DEG ? null : heading, magnitude });
  }

  const room = simulating ? toReadings(phones) : [];
  const mine = { id: 'you', heading: aim.heading, magnitude: aim.magnitude };
  const counts = countsFrom([...room, mine]);
  const total = room.length + 1;
  const wedge = aim.heading === null ? null : headingToWedge(aim.heading);
  const aiming = wedge === null ? null : FALLBACK_OPTIONS[wedge];

  return (
    <main className="stage">
      <p className="demo-note">
        {simulating ? (
          <>
            A demo of the voting screen. The other {SIM_PHONE_COUNT} phones are simulated — a
            real round starts from a QR code on the host&rsquo;s screen.
          </>
        ) : (
          <>
            A demo of the voting screen. Just you on the dial — a real round starts from a QR
            code on the host&rsquo;s screen.
          </>
        )}
      </p>

      <div className="dial-wrap" onPointerMove={aimAtPointer} onPointerDown={aimAtPointer}>
        <Dial
          options={FALLBACK_OPTIONS}
          counts={counts}
          active={wedge}
          heading={aim.heading}
          magnitude={aim.magnitude}
          total={total}
          showCounts
          readings={room}
        />
      </div>

      <div className="status-line">
        <span className="dot" />
        {aiming ? `Aiming at ${aiming}` : 'Level — aiming at nothing'}
      </div>

      <p className="status-hint">
        {tilting
          ? 'Tilt your phone toward an option. Lie it flat to abstain.'
          : 'Move or drag across the dial to aim. Near the middle counts as abstaining.'}
      </p>

      <div className="demo-controls">
        <button
          className="ctl is-primary"
          onClick={() => setSimulating((on) => !on)}
        >
          {simulating ? 'Just me' : 'Simulate other users'}
        </button>
        {!tilting && canAskForTilt && (
          <button className="ctl" onClick={askForTilt}>
            Use my phone&rsquo;s tilt
          </button>
        )}
      </div>
    </main>
  );
}
