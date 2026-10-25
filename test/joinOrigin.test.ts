import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseJoinOrigin, joinUrl } from '../lib/joinOrigin.ts';

const HERE = 'https://tilt2vote-git-main-thibblab.vercel.app';
const PUBLIC = 'https://tilt2vote.vercel.app';

test('a reachable origin is used as-is, fallback or not', () => {
  for (const canonical of [PUBLIC, '']) {
    assert.deepEqual(chooseJoinOrigin({ current: HERE, canonical, reach: 'public' }), {
      origin: HERE,
      reason: 'current',
    });
  }
});

test('a walled origin falls back to the configured public one', () => {
  assert.deepEqual(
    chooseJoinOrigin({ current: HERE, canonical: PUBLIC, reach: 'unreachable' }),
    { origin: PUBLIC, reason: 'fallback' },
  );
});

test('a walled origin with no fallback encodes nothing at all', () => {
  // Showing a code here would scan cleanly and strand the whole room.
  assert.deepEqual(chooseJoinOrigin({ current: HERE, canonical: '', reach: 'unreachable' }), {
    origin: null,
    reason: 'stranded',
  });
});

test('a fallback equal to the walled origin is no fallback', () => {
  assert.deepEqual(
    chooseJoinOrigin({ current: PUBLIC, canonical: PUBLIC, reach: 'unreachable' }),
    { origin: null, reason: 'stranded' },
  );
});

test('a trailing slash is not a different origin', () => {
  assert.deepEqual(
    chooseJoinOrigin({ current: HERE, canonical: `${PUBLIC}/`, reach: 'unreachable' }),
    { origin: PUBLIC, reason: 'fallback' },
  );
  assert.deepEqual(
    chooseJoinOrigin({ current: `${PUBLIC}/`, canonical: PUBLIC, reach: 'unreachable' }),
    { origin: null, reason: 'stranded' },
  );
});

test('nothing is encoded before the probe answers', () => {
  assert.deepEqual(chooseJoinOrigin({ current: HERE, canonical: PUBLIC, reach: 'checking' }), {
    origin: null,
    reason: 'checking',
  });
});

test('a probe that could not run fails open rather than blaming the origin', () => {
  // A failed request is not evidence of a wall. Treating it as one would break
  // every setup that works today.
  assert.deepEqual(chooseJoinOrigin({ current: HERE, canonical: PUBLIC, reach: 'unknown' }), {
    origin: HERE,
    reason: 'current',
  });
});

test('the server render has no origin to offer', () => {
  for (const current of [null, undefined, '']) {
    assert.deepEqual(chooseJoinOrigin({ current, canonical: PUBLIC, reach: 'public' }), {
      origin: null,
      reason: 'checking',
    });
  }
});

test('the join link carries the room id and nothing else', () => {
  assert.equal(joinUrl(PUBLIC, 'bcdfghjkmnpqrs', 'r'), `${PUBLIC}/?r=bcdfghjkmnpqrs`);
});
