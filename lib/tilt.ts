/**
 * Device orientation -> one of the configured wedges.
 *
 * Pure logic, no React and no browser APIs, so the boundary behaviour can be
 * tested without a phone. See RATIONALE below each constant for why it exists.
 */

export const WEDGE_COUNT = 6;
export const WEDGE_DEG = 360 / WEDGE_COUNT; // 60

/** Below this much tilt the phone is "flat" and the voter is abstaining. */
export const DEAD_ZONE_DEG = 15;
/** Once committed, you must fall this far back under the dead zone to abstain. */
export const DEAD_ZONE_RELEASE_DEG = 10;
/** Degrees past a wedge boundary before the vote switches. Kills border flicker. */
export const HYSTERESIS_DEG = 8;
/** Exponential smoothing weight on new samples. Raw sensor data jitters ~3 deg at rest. */
export const SMOOTHING = 0.2;
/**
 * Smoothing weight once the phone is unmistakably being swung rather than held.
 *
 * A single fixed weight has to serve two opposite jobs: hide three degrees of
 * sensor noise in a hand that is trying to stay still, and keep up with an arm
 * deliberately sweeping the dial. Tuned for the first, it costs about a third of
 * a second to catch up with the second -- which is most of the delay left
 * between a phone moving and its dot arriving on the host screen.
 */
export const SMOOTHING_FAST = 0.6;
/**
 * How much sustained travel per sample, in degrees, relaxes the filter fully.
 *
 * Sustained is the operative word. Noise is zero-mean, so smoothing the signed
 * change cancels it out, while real movement pushes the same way sample after
 * sample and accumulates. That is what separates a wobble from a swing -- the
 * two are the same size instant to instant.
 */
export const FAST_DEG_PER_SAMPLE = 3;
/** Travel this small is taken to be noise and buys no relaxation at all. */
export const JITTER_DEG_PER_SAMPLE = 1.5;
/** Weight on the travel estimate itself. Lower than SMOOTHING: it is the thing
    doing the noise cancelling, so it has to be quieter than what it measures. */
export const TRAVEL_SMOOTHING = 0.25;

export interface Orientation {
  /** front-back tilt, -180..180 */
  beta: number | null;
  /** left-right tilt, -90..90 */
  gamma: number | null;
}

export interface TiltReading {
  /** 0..(option count - 1), or null when the phone is flat (abstaining) */
  wedge: number | null;
  /** how far the phone is tilted, degrees, clamped to 90 */
  magnitude: number;
  /** direction of tilt in degrees clockwise from "away from you", or null when flat */
  heading: number | null;
}

/** Shortest signed difference a-b, in (-180, 180]. */
export function angleDelta(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** Wedge whose centre is nearest this heading, ignoring hysteresis. */
export function headingToWedge(heading: number, optionCount = WEDGE_COUNT): number {
  const wedgeDeg = 360 / optionCount;
  const shifted = (((heading + wedgeDeg / 2) % 360) + 360) % 360;
  return Math.floor(shifted / wedgeDeg) % optionCount;
}

/** Centre heading of a wedge, in degrees. Wedge 0 points straight away from you. */
export function wedgeCentre(wedge: number, optionCount = WEDGE_COUNT): number {
  return wedge * (360 / optionCount);
}

export interface TiltTracker {
  update(o: Orientation, optionCount?: number): TiltReading;
  reset(): void;
}

/**
 * Stateful because both the smoothing filter and the hysteresis need to know
 * where the phone was a moment ago. One tracker per phone.
 */
export function createTiltTracker(): TiltTracker {
  let sBeta: number | null = null;
  let sGamma: number | null = null;
  let wedge: number | null = null;
  let previousCount = WEDGE_COUNT;
  // Signed, so a hand shaking about a fixed point averages back to nothing.
  let travelBeta = 0;
  let travelGamma = 0;

  return {
    reset() {
      sBeta = sGamma = null;
      wedge = null;
      travelBeta = travelGamma = 0;
    },

    update({ beta, gamma }: Orientation, optionCount = WEDGE_COUNT): TiltReading {
      if (optionCount !== previousCount) {
        wedge = null;
        previousCount = optionCount;
      }
      if (beta == null || gamma == null) {
        return { wedge, magnitude: 0, heading: null };
      }

      // Low-pass filter. First sample seeds the filter rather than easing into it
      // from zero, otherwise the dial visibly slides in from the centre on load.
      if (sBeta === null || sGamma === null) {
        sBeta = beta;
        sGamma = gamma;
      } else {
        const dBeta = beta - sBeta;
        const dGamma = gamma - sGamma;

        // How far the phone has been travelling, not how far it just jumped.
        travelBeta += (dBeta - travelBeta) * TRAVEL_SMOOTHING;
        travelGamma += (dGamma - travelGamma) * TRAVEL_SMOOTHING;

        // Relax the filter in proportion to that, past a floor that noise on its
        // own cannot clear. Held still, this is SMOOTHING and nothing changes.
        const excess = Math.max(0, Math.hypot(travelBeta, travelGamma) - JITTER_DEG_PER_SAMPLE);
        const alpha =
          SMOOTHING + (SMOOTHING_FAST - SMOOTHING) * Math.min(1, excess / FAST_DEG_PER_SAMPLE);

        sBeta += dBeta * alpha;
        sGamma += dGamma * alpha;
      }

      const magnitude = Math.min(90, Math.hypot(sGamma, sBeta));

      // Asymmetric threshold: harder to start voting than to keep voting, so a
      // hand wobbling around 15 degrees does not drop in and out of the count.
      const threshold = wedge === null ? DEAD_ZONE_DEG : DEAD_ZONE_RELEASE_DEG;
      if (magnitude < threshold) {
        wedge = null;
        return { wedge: null, magnitude, heading: null };
      }

      // Screen-up phone: tilting the top edge away from you is beta < 0, so -beta
      // is "north". atan2(east, north) then reads clockwise from north.
      const heading = ((Math.atan2(sGamma, -sBeta) * 180) / Math.PI + 360) % 360;

      if (wedge === null) {
        wedge = headingToWedge(heading, optionCount);
      } else {
        const drift = Math.abs(angleDelta(heading, wedgeCentre(wedge, optionCount)));
        if (drift > 180 / optionCount + HYSTERESIS_DEG) {
          wedge = headingToWedge(heading, optionCount);
        }
      }

      return { wedge, magnitude, heading };
    },
  };
}
