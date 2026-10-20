import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAircraftProviderErrors,
  shouldAcceptAircraftResult,
} from './aircraftProvider.js';

test('accepts an empty snapshot from the configured relay', () => {
  assert.equal(shouldAcceptAircraftResult('GEV RELAY', 0, 'AIRPLANES.LIVE'), true);
});

test('continues to the next direct provider after an empty non-final response', () => {
  assert.equal(shouldAcceptAircraftResult('ADSB.LOL', 0, 'AIRPLANES.LIVE'), false);
});

test('accepts a non-empty snapshot from any provider', () => {
  assert.equal(shouldAcceptAircraftResult('ADSB.LOL', 3, 'AIRPLANES.LIVE'), true);
});

test('accepts an empty response from the final provider as a valid zero-contact result', () => {
  assert.equal(shouldAcceptAircraftResult('AIRPLANES.LIVE', 0, 'AIRPLANES.LIVE'), true);
});

test('keeps the failing provider visible when acquisition sources error', () => {
  assert.equal(
    formatAircraftProviderErrors([
      { provider: 'GEV RELAY', message: 'Failed to fetch' },
      { provider: 'ADSB.LOL', message: 'Failed to fetch' },
    ]),
    'GEV RELAY: Failed to fetch | ADSB.LOL: Failed to fetch',
  );
});
