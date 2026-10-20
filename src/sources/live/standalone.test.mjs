import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlightSource } from './standalone.js';

test('flight source forwards the adaptive radius with the focal coordinates', async () => {
  let requestedUrl = null;
  const source = createFlightSource({
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return {
        ok: false,
        status: 503,
        headers: { get: () => null },
        json: async () => ({ error: 'test' }),
      };
    },
  });

  await assert.rejects(
    source.getSnapshot({
      latitude: 50.1,
      longitude: 8.6,
      radiusNm: 37.5,
    }),
  );

  assert.equal(
    requestedUrl,
    '/api/flights?lat=50.1000&lon=8.6000&radius_nm=37.5',
  );
});
