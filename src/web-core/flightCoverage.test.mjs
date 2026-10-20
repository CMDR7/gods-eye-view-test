import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  AIRCRAFT_COVERAGE_FALLBACK_RADIUS_NM,
  AIRCRAFT_COVERAGE_MAX_RADIUS_NM,
  computeAircraftCoverageRadiusNm,
  distanceNm,
  getAircraftApertureCoverage,
} from './flightCoverage.js';

test('geodesic distance uses nautical miles', () => {
  const distance = distanceNm(
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 1 },
  );
  assert.ok(distance > 59 && distance < 61);
});

test('coverage radius uses the farthest aperture sample plus margin', () => {
  const focal = { latitude: 0, longitude: 0 };
  const points = [
    { latitude: 0, longitude: 1 },
    { latitude: 0, longitude: 2 },
    { latitude: 1, longitude: 0 },
    { latitude: -1, longitude: 0 },
  ];
  const farthest = distanceNm(focal, points[1]);
  assert.equal(computeAircraftCoverageRadiusNm(focal, points), Math.ceil(farthest * 1.1));
});

test('coverage radius is capped at the provider maximum', () => {
  const radius = computeAircraftCoverageRadiusNm(
    { latitude: 0, longitude: 0 },
    [
      { latitude: 20, longitude: 0 },
      { latitude: -20, longitude: 0 },
      { latitude: 0, longitude: 30 },
      { latitude: 0, longitude: -30 },
    ],
  );
  assert.equal(radius, AIRCRAFT_COVERAGE_MAX_RADIUS_NM);
});

test('sparse horizon intersections use the conservative fallback radius', () => {
  assert.equal(
    computeAircraftCoverageRadiusNm(
      { latitude: 50, longitude: 8 },
      [{ latitude: 50.1, longitude: 8 }, { latitude: 50, longitude: 8.1 }],
    ),
    AIRCRAFT_COVERAGE_FALLBACK_RADIUS_NM,
  );
});

function makeViewer({ missCenterGlobe = false, missCenterEllipsoid = false } = {}) {
  const width = 390;
  const height = 844;
  const centerX = width / 2;
  const centerY = height / 2;
  const isCenter = (point) => point.x === centerX && point.y === centerY;
  const toCartesian = (point) => {
    const latitude = 50 + (point.y - centerY) / 100;
    const longitude = (point.x - centerX) / 100;
    return Cesium.Cartesian3.fromDegrees(longitude, latitude, 0);
  };
  const canvas = { clientWidth: width, clientHeight: height };
  const scene = {
    canvas,
    globe: {
      ellipsoid: Cesium.Ellipsoid.WGS84,
      pick(ray) {
        if (missCenterGlobe && isCenter(ray)) return undefined;
        return toCartesian(ray);
      },
    },
  };
  const camera = {
    getPickRay(position) {
      return { x: position.x, y: position.y };
    },
    pickEllipsoid(position) {
      if (missCenterEllipsoid && isCenter(position)) return undefined;
      return toCartesian(position);
    },
    positionCartographic: Cesium.Cartographic.fromDegrees(120, 70, 3_500_000),
  };
  return { scene, camera, canvas };
}

test('aircraft focal point uses the screen-centre globe pick, not camera subpoint', () => {
  const coverage = getAircraftApertureCoverage(makeViewer());
  assert.ok(coverage);
  assert.ok(Math.abs(coverage.latitude - 50) < 1e-6);
  assert.ok(Math.abs(coverage.longitude) < 1e-6);
  assert.ok(coverage.radiusNm >= 1 && coverage.radiusNm <= 250);
  assert.ok(coverage.boundarySampleCount >= 4);
});

test('aircraft focal point falls back to the ellipsoid when globe pick misses', () => {
  const coverage = getAircraftApertureCoverage(makeViewer({ missCenterGlobe: true }));
  assert.ok(coverage);
  assert.ok(Math.abs(coverage.latitude - 50) < 1e-6);
  assert.ok(Math.abs(coverage.longitude) < 1e-6);
});

test('coverage is unavailable rather than using the camera subpoint when both centre picks miss', () => {
  assert.equal(
    getAircraftApertureCoverage(makeViewer({
      missCenterGlobe: true,
      missCenterEllipsoid: true,
    })),
    null,
  );
});

test('coverage refuses a missing or degenerate viewport', () => {
  assert.equal(getAircraftApertureCoverage(null), null);
  assert.equal(getAircraftApertureCoverage({ scene: {}, camera: {} }), null);
});
