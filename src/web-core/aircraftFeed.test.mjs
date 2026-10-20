import test from 'node:test';
import assert from 'node:assert/strict';
import { selectWebCoreAircraft } from './aircraftFeed.js';

const vector = ({
  hex = 'abc123',
  callsign = ' TEST123 ',
  lon = 8,
  lat = 50,
  altitudeM = 1200,
  squawk = '7000',
  category = 4,
} = {}) => [
  hex, callsign, null, 0, 0, lon, lat, altitudeM, false, null, null, null,
  null, null, squawk, false, 0, category,
];

test('Web Core accepts positioned OpenSky-compatible state vectors in coverage', () => {
  const aircraft = selectWebCoreAircraft(
    { states: [vector(), vector({ hex: 'def456', lon: 8.1, lat: 50.02 })] },
    { latitude: 50, longitude: 8 },
    { radiusNm: 10 },
  );

  assert.equal(aircraft.length, 2);
  assert.equal(aircraft[0].hex, 'abc123');
  assert.equal(aircraft[0].flight, 'TEST123');
  assert.equal(aircraft[0].altitudeM, 1200);
  assert.equal(aircraft[0].squawk, '7000');
});

test('Web Core drops missing/out-of-range positions and contacts outside coverage', () => {
  const aircraft = selectWebCoreAircraft(
    {
      states: [
        vector(),
        vector({ hex: 'missing', lon: null, lat: null }),
        vector({ hex: 'invalid', lon: 181, lat: 50 }),
        vector({ hex: 'far', lon: 8, lat: 52 }),
      ],
    },
    { latitude: 50, longitude: 8 },
    { radiusNm: 10 },
  );

  assert.deepEqual(aircraft.map(({ hex }) => hex), ['abc123']);
});

test('Web Core enforces its render cap', () => {
  const aircraft = selectWebCoreAircraft(
    { states: [vector(), vector({ hex: 'def456', lon: 8.01 }), vector({ hex: 'fedcba', lon: 7.99 })] },
    { latitude: 50, longitude: 8 },
    { radiusNm: 10, maxRows: 2 },
  );

  assert.equal(aircraft.length, 2);
});

test('Web Core rejects a malformed API response instead of silently reporting zero aircraft', () => {
  assert.throws(
    () => selectWebCoreAircraft({ ac: [] }, { latitude: 50, longitude: 8 }),
    /states missing/,
  );
});
