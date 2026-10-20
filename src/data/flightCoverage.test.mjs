import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoFlightCoverageRadiusNm,
  filterFlightsToCoverage,
  flightDistanceNm,
  FLIGHT_COVERAGE_MAX_RADIUS_NM,
  FLIGHT_COVERAGE_MIN_RADIUS_NM,
} from './flightCoverage.js';

test('viewport footprint drives a larger radius as the visible ground expands', () => {
  const focalPoint = { latitude: 0, longitude: 0 };
  const closeFootprint = [{ latitude: 0.1, longitude: 0 }];
  const wideFootprint = [{ latitude: 1, longitude: 0 }];

  const closeRadius = autoFlightCoverageRadiusNm(focalPoint, closeFootprint);
  const wideRadius = autoFlightCoverageRadiusNm(focalPoint, wideFootprint);

  assert.ok(closeRadius >= FLIGHT_COVERAGE_MIN_RADIUS_NM);
  assert.ok(wideRadius > closeRadius);
  assert.ok(wideRadius < FLIGHT_COVERAGE_MAX_RADIUS_NM);
});

test('coverage radius is capped when the visible footprint exceeds provider range', () => {
  assert.equal(
    autoFlightCoverageRadiusNm({ latitude: 0, longitude: 0 }, [
      { latitude: 20, longitude: 0 },
    ]),
    FLIGHT_COVERAGE_MAX_RADIUS_NM,
  );
});

test('coverage defaults conservatively when the viewport boundary misses the globe', () => {
  assert.equal(
    autoFlightCoverageRadiusNm({ latitude: 0, longitude: 0 }, []),
    FLIGHT_COVERAGE_MAX_RADIUS_NM,
  );
});

test('great-circle distance handles the antimeridian', () => {
  const distance = flightDistanceNm(
    { latitude: 0, longitude: 179.9 },
    { latitude: 0, longitude: -179.9 },
  );

  assert.ok(distance > 10 && distance < 15);
});

test('global snapshots are filtered to the active focal-point radius', () => {
  const records = [
    { id: 'near', latitude: 0.1, longitude: 0 },
    { id: 'far', latitude: 1, longitude: 0 },
  ];

  assert.deepEqual(
    filterFlightsToCoverage(records, {
      latitude: 0,
      longitude: 0,
      radiusNm: 20,
    }).map((record) => record.id),
    ['near'],
  );
});
