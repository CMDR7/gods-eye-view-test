import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  ACQUISITION_MAX_RADIUS_NM,
  ACQUISITION_MIN_RADIUS_NM,
  createController,
} from './controller.js';

function queryFor(viewer) {
  return createController({
    flightState: { feed: { _activeUpdateControllers: new Set() } },
    services: {},
    parts: {},
    layer: {},
    resolveAsset: (url) => url,
  })._flightQuery(viewer);
}

function expectedQuery(position) {
  const cartographic = Cesium.Cartographic.fromCartesian(position);
  return {
    latitude: Cesium.Math.toDegrees(cartographic.latitude),
    longitude: Cesium.Math.toDegrees(cartographic.longitude),
  };
}

function viewerFor({ width, height, center, boundaryDistanceDeg }) {
  const centerPosition = Cesium.Cartesian3.fromDegrees(
    center.longitude,
    center.latitude,
    0,
  );
  const centerCartographic = Cesium.Cartographic.fromDegrees(
    center.longitude,
    center.latitude,
  );
  return {
    canvas: { clientWidth: width, clientHeight: height },
    scene: {
      globe: {
        ellipsoid: Cesium.Ellipsoid.WGS84,
        pick: (ray) => ray.position,
      },
    },
    camera: {
      getPickRay: (point) => {
        const x = point.x / width;
        const y = point.y / height;
        const longitude =
          center.longitude + (x - 0.5) * boundaryDistanceDeg;
        const latitude = center.latitude + (y - 0.5) * boundaryDistanceDeg;
        return {
          position: Cesium.Cartesian3.fromDegrees(longitude, latitude, 0),
        };
      },
      pickEllipsoid: () => centerPosition,
      positionCartographic: centerCartographic,
    },
  };
}

test('center globe pick determines query location', () => {
  const position = Cesium.Cartesian3.fromDegrees(8.6, 50.1, 0);
  const viewer = {
    canvas: { clientWidth: 800, clientHeight: 600 },
    scene: {
      globe: {
        ellipsoid: Cesium.Ellipsoid.WGS84,
        pick: (ray) => {
          assert.deepEqual(ray, { source: 'view-center' });
          return position;
        },
      },
    },
    camera: {
      getPickRay: (point) => {
        assert.equal(point.x, 400);
        assert.equal(point.y, 300);
        return { source: 'view-center' };
      },
      pickEllipsoid: () => assert.fail('unexpected fallback'),
    },
  };

  assert.deepEqual(queryFor(viewer), {
    ...expectedQuery(position),
    radiusNm: ACQUISITION_MAX_RADIUS_NM,
  });
});

test('ellipsoid fallback is used when globe picking misses', () => {
  const position = Cesium.Cartesian3.fromDegrees(-73.9, 40.7, 0);
  const viewer = {
    canvas: { clientWidth: 390, clientHeight: 844 },
    scene: {
      globe: {
        ellipsoid: Cesium.Ellipsoid.WGS84,
        pick: () => undefined,
      },
    },
    camera: {
      getPickRay: () => ({ source: 'view-center' }),
      pickEllipsoid: (point, ellipsoid) => {
        assert.equal(point.x, 195);
        assert.equal(point.y, 422);
        assert.equal(ellipsoid, Cesium.Ellipsoid.WGS84);
        return position;
      },
    },
  };

  assert.deepEqual(queryFor(viewer), {
    ...expectedQuery(position),
    radiusNm: ACQUISITION_MAX_RADIUS_NM,
  });
});

test('adaptive radius expands with a wider visible footprint', () => {
  const close = queryFor(
    viewerFor({
      width: 800,
      height: 600,
      center: { latitude: 50, longitude: 8 },
      boundaryDistanceDeg: 0.5,
    }),
  );
  const wide = queryFor(
    viewerFor({
      width: 800,
      height: 600,
      center: { latitude: 50, longitude: 8 },
      boundaryDistanceDeg: 10,
    }),
  );

  assert.ok(close.radiusNm >= ACQUISITION_MIN_RADIUS_NM);
  assert.ok(wide.radiusNm > close.radiusNm);
  assert.ok(wide.radiusNm <= ACQUISITION_MAX_RADIUS_NM);
});

test('adaptive radius remains capped at the provider limit', () => {
  const query = queryFor(
    viewerFor({
      width: 800,
      height: 600,
      center: { latitude: 0, longitude: 0 },
      boundaryDistanceDeg: 90,
    }),
  );

  assert.equal(query.radiusNm, ACQUISITION_MAX_RADIUS_NM);
});

test('no coordinates returned when the view center misses the globe', () => {
  const cameraPosition = Cesium.Cartographic.fromDegrees(10, 50);
  const viewer = {
    canvas: { clientWidth: 390, clientHeight: 844 },
    scene: {
      globe: {
        ellipsoid: Cesium.Ellipsoid.WGS84,
        pick: () => undefined,
      },
    },
    camera: {
      getPickRay: () => ({ source: 'view-center' }),
      pickEllipsoid: () => undefined,
      positionCartographic: cameraPosition,
    },
  };

  assert.deepEqual(queryFor(viewer), {});
});
