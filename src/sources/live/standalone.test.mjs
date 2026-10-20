import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlightSource } from './standalone.js';

function stateVector(id, latitude, longitude, timestamp) {
  const row = Array(18).fill(null);
  row[0] = id;
  row[1] = `${id.toUpperCase()} `;
  row[2] = 'Germany';
  row[3] = timestamp;
  row[4] = timestamp;
  row[5] = longitude;
  row[6] = latitude;
  row[7] = 10000;
  row[8] = false;
  row[9] = 120;
  row[10] = 90;
  row[11] = 0;
  row[13] = 10000;
  row[17] = 2;
  return row;
}

test('flight source forwards radius_nm and filters worldwide snapshots to coverage', async () => {
  const now = Date.now();
  let requestedUrl;
  const source = createFlightSource({
    now: () => now,
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return Response.json({
        time: Math.floor(now / 1000),
        states: [
          stateVector('near01', 0.1, 0, Math.floor(now / 1000)),
          stateVector('far001', 1, 0, Math.floor(now / 1000)),
        ],
      });
    },
  });

  const snapshot = await source.getSnapshot({
    latitude: 0,
    longitude: 0,
    radiusNm: 20,
  });
  const url = new URL(requestedUrl, 'https://local.invalid');

  assert.equal(url.searchParams.get('lat'), '0.0000');
  assert.equal(url.searchParams.get('lon'), '0.0000');
  assert.equal(url.searchParams.get('radius_nm'), '20');
  assert.deepEqual(
    snapshot.records.map((record) => record.id),
    ['near01'],
  );
  assert.equal(snapshot.coverage, '20nm focal-point coverage');
});
