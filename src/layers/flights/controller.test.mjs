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

function expectedQuery(position, radiusNm = 10) {
  const cartographic = Cesium.Cartographic.fromCartesian(position);
  return {
    latitude: Cesium.Math.toDegrees(cartographic.latitude),
    longitude: Cesium.Math.toDegrees(cartographic.longitude),
    radiusNm,
  };
}

test('center globe pick determines focal point and viewport coverage radius', () => {
  const position = Cesium.Cartesian3.fromDegrees(8.6, 50.1, 0);
  const viewer = {
    canvas: { clientWidth: 800, clientHeight: 600 },
    scene: {
      globe: {
        ellipsoid: Cesium.Ellipsoid.WGS84,
        pick: (ray) => {
          if (ray.source === 'view-center')
            assert.deepEqual(ray, { source: 'view-center' });
          return position;
        },
      },
    },
    camera: {
      getPickRay: (point) => ({
        source:
          point.x === 400 && point.y === 300 ? 'view-center' : 'edge',
      }),
      pickEllipsoid: () => assert.fail('unexpected fallback'),
    },
  };

  assert.deepEqual(queryFor(viewer), expectedQuery(position));
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
      getPickRay: () => ({ source: 'view' }),
      pickEllipsoid: (point, ellipsoid) => {
        assert.equal(ellipsoid, Cesium.Ellipsoid.WGS84);
        return position;
      },
    },
  };

  assert.deepEqual(queryFor(viewer), expectedQuery(position));
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
      getPickRay: () => ({ source: 'view' }),
      pickEllipsoid: () => undefined,
      positionCartographic: cameraPosition,
    },
  };

  assert.deepEqual(queryFor(viewer), {});
});
