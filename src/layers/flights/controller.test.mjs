import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createController } from './controller.js';

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

test('civil aircraft query uses the geographic point at the viewport center', () => {
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
      pickEllipsoid: () => {
        assert.fail('ellipsoid fallback should not run when globe picking succeeds');
      },
      positionCartographic: Cesium.Cartographic.fromDegrees(-70, 40, 1_000_000),
    },
  };

  assert.deepEqual(queryFor(viewer), expectedQuery(position));
});

test('civil aircraft query falls back to the ellipsoid when globe picking misses', () => {
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

  assert.deepEqual(queryFor(viewer), expectedQuery(position));
});

test('civil aircraft query avoids using camera subpoint when the view center misses the globe', () => {
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
      positionCartographic: Cesium.Cartographic.fromDegrees(10, 50, 3_500_000),
    },
  };

  assert.deepEqual(queryFor(viewer), {});
});
