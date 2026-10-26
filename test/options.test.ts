import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_OPTIONS, MAX_OPTIONS, MAX_OPTION_LEN, validOptions } from '../lib/constants.ts';
import { headingToWedge, wedgeCentre, createTiltTracker } from '../lib/tilt.ts';
import { countsFrom, countsToTallies, parseTallies, talliesToCounts } from '../lib/tally.ts';
import { toSessionRow } from '../lib/session.ts';

for (let count = MIN_OPTIONS; count <= MAX_OPTIONS; count++) {
  test(`${count} options share the full circle and survive live and frozen tallying`, () => {
    const options = Array.from({ length: count }, (_, w) => `Choice ${w + 1}`);
    assert.ok(validOptions(options));
    assert.deepEqual(toSessionRow({ options })?.options, options);
    const readings = options.map((_, w) => {
      const heading = wedgeCentre(w, count);
      assert.equal(headingToWedge(heading, count), w);
      const tracker = createTiltTracker();
      const radians = heading * Math.PI / 180;
      assert.equal(tracker.update({ beta: -40 * Math.cos(radians), gamma: 40 * Math.sin(radians) }, count).wedge, w);
      return { id: String(w), heading, magnitude: 40 };
    });
    // Every degree of the circle belongs to exactly one available option.
    for (let deg = 0; deg < 360; deg += 0.5) {
      const expected = Math.floor((deg + 180 / count) / (360 / count)) % count;
      assert.equal(headingToWedge(deg, count), expected);
    }
    const counts = countsFrom([...readings, { id: 'flat', heading: null, magnitude: 0 }], count);
    assert.deepEqual(counts, new Array(count).fill(1));
    const frozen = parseTallies(countsToTallies(counts), count);
    assert.deepEqual(talliesToCounts(frozen, count), counts);
    assert.equal(parseTallies({ [count]: 1 }, count), null);
  });
}

test('changing the layout remaps an already tilted phone without moving it', () => {
  const tracker = createTiltTracker();
  const orientation = { beta: 0, gamma: -40 };
  assert.equal(tracker.update(orientation, 12).wedge, 9);
  assert.equal(tracker.update(orientation, 4).wedge, 3);
  assert.equal(tracker.update(orientation, 2).wedge, 0);
});

test('option validation rejects unusable counts and labels', () => {
  for (const value of [null, [], ['one'], Array(MAX_OPTIONS + 1).fill('label'), ['one', '  '], ['one', 2], ['one', 'x'.repeat(MAX_OPTION_LEN + 1)]]) {
    assert.equal(validOptions(value), false);
  }
  assert.equal(validOptions(['one', 'x'.repeat(MAX_OPTION_LEN)]), true);
});
