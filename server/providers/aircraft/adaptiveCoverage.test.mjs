import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeFlightPayload } from './adaptiveCoverage.js';

test('scopeFlightPayload keeps aircraft inside the requested radius', () => {
  const payload = {
    time: 1,
    states: [
      ['inside', '', '', '', 0, 8.05, 50.05],
      ['outside', '', '', '', 0, 9.5, 51.5],
      ['invalid', '', '', '', 0, null, null],
    ],
  };

  const scoped = scopeFlightPayload(payload, {
    latitude: 50,
    longitude: 8,
    radiusNm: 10,
  });

  assert.deepEqual(scoped.states.map((state) => state[0]), ['inside']);
  assert.equal(scoped.time, 1);
});

test('scopeFlightPayload is a no-op without a requested scope', () => {
  const payload = { time: 1, states: [['a', '', '', '', 0, 8, 50]] };
  assert.strictEqual(scopeFlightPayload(payload), payload);
});
