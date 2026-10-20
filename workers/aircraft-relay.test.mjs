import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSuccessfulResult } from './aircraft-relay.js';

test('prefers a non-empty provider response over an earlier successful empty response', () => {
  const results = [
    { provider: 'AIRPLANES.LIVE', ok: true, aircraft: [] },
    { provider: 'ADSB.LOL', ok: true, aircraft: [{ hex: 'abc123' }] },
  ];

  assert.equal(selectSuccessfulResult(results), results[1]);
});

test('returns a successful empty response when no provider has aircraft', () => {
  const results = [
    { provider: 'AIRPLANES.LIVE', ok: true, aircraft: [] },
    { provider: 'ADSB.LOL', ok: true, aircraft: [] },
  ];

  assert.equal(selectSuccessfulResult(results), results[0]);
});

test('returns null when every provider request fails', () => {
  assert.equal(
    selectSuccessfulResult([
      { provider: 'AIRPLANES.LIVE', ok: false, aircraft: [] },
      { provider: 'ADSB.LOL', ok: false, aircraft: [] },
    ]),
    null,
  );
});
