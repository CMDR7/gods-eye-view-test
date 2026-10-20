import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adsbLolFallbackAnchor,
  adsbLolFallbackCacheKey,
} from './opensky.js';

function request(query = '') {
  return { url: `/api/flights${query}` };
}

test(
  'regional fallback defaults to the provider maximum when radius is omitted',
  () => {
    assert.deepEqual(adsbLolFallbackAnchor(request('?lat=50&lon=8')), {
      latitude: 50,
      longitude: 8,
      radiusNm: 250,
    });
  },
);

test('regional fallback parses and bounds the requested radius', () => {
  assert.deepEqual(
    adsbLolFallbackAnchor(request('?lat=50&lon=8&radius_nm=75')),
    { latitude: 50, longitude: 8, radiusNm: 75 },
  );
  assert.equal(
    adsbLolFallbackAnchor(request('?lat=50&lon=8&radius_nm=2')).radiusNm,
    10,
  );
  assert.equal(
    adsbLolFallbackAnchor(request('?lat=50&lon=8&radius_nm=999')).radiusNm,
    250,
  );
  assert.equal(
    adsbLolFallbackAnchor(request('?lat=50&lon=8&radius_nm=nope')).radiusNm,
    250,
  );
});

test('regional fallback cache key separates different coverage radii', () => {
  const narrow = {
    latitude: 50.01,
    longitude: 8.01,
    radiusNm: 25,
  };
  const wide = { ...narrow, radiusNm: 150 };

  assert.notEqual(
    adsbLolFallbackCacheKey(narrow),
    adsbLolFallbackCacheKey(wide),
  );
});
