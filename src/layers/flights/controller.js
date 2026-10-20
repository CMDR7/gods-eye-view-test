import * as Cesium from 'cesium';
import { autoFlightCoverageRadiusNm } from '../../data/flightCoverage.js';

export function createController({
  flightState,
  services,
  parts,
  layer,
  resolveAsset,
}) {
  function _abortActiveUpdates() {
    for (const controller of flightState.feed._activeUpdateControllers)
      controller.abort();
    flightState.feed._activeUpdateControllers.clear();
  }

  function _screenCartographic(scene, camera, ellipsoid, x, y) {
    const point = new Cesium.Cartesian2(x, y);
    const ray = camera.getPickRay?.(point);
    const globePosition = ray ? scene.globe?.pick(ray, scene) : undefined;
    const position = Cesium.defined(globePosition)
      ? globePosition
      : camera.pickEllipsoid?.(point, ellipsoid);
    if (!Cesium.defined(position)) return null;

    const cartographic = Cesium.Cartographic.fromCartesian(position, ellipsoid);
    if (!cartographic) return null;
    return {
      latitude: Cesium.Math.toDegrees(cartographic.latitude),
      longitude: Cesium.Math.toDegrees(cartographic.longitude),
    };
  }

  function _flightQuery(viewer) {
    const scene = viewer?.scene;
    const camera = viewer?.camera;
    const canvas = viewer?.canvas || scene?.canvas;
    const width = Number(canvas?.clientWidth);
    const height = Number(canvas?.clientHeight);
    if (
      !scene ||
      !camera ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    )
      return {};

    const ellipsoid = scene.globe?.ellipsoid || Cesium.Ellipsoid.WGS84;
    const focalPoint = _screenCartographic(
      scene,
      camera,
      ellipsoid,
      width / 2,
      height / 2,
    );
    if (!focalPoint) return {};

    // Sample each viewport edge rather than using the crosshair as a required
    // aircraft location. Misses at the horizon are ignored; if every edge ray
    // misses, auto coverage falls back conservatively to the provider maximum.
    const boundaryPoints = [];
    const centerX = width / 2;
    const centerY = height / 2;
    const lastX = Math.max(0, width - 1);
    const lastY = Math.max(0, height - 1);
    const edgeAnchors = [
      [0, 0],
      [centerX, 0],
      [lastX, 0],
      [lastX, centerY],
      [lastX, lastY],
      [centerX, lastY],
      [0, lastY],
      [0, centerY],
    ];
    const inwardFractions = [
      0.9375, 0.875, 0.75, 0.625, 0.5, 0.375, 0.25, 0.125, 0.0625,
    ];
    for (const [edgeX, edgeY] of edgeAnchors) {
      let point = _screenCartographic(scene, camera, ellipsoid, edgeX, edgeY);
      if (point) {
        boundaryPoints.push(point);
        continue;
      }
      // A horizon may cross the viewport before its border. Walk inward along
      // that screen ray to find the furthest sampled ground intersection.
      for (const fraction of inwardFractions) {
        point = _screenCartographic(
          scene,
          camera,
          ellipsoid,
          centerX + (edgeX - centerX) * fraction,
          centerY + (edgeY - centerY) * fraction,
        );
        if (point) {
          boundaryPoints.push(point);
          break;
        }
      }
    }

    return {
      ...focalPoint,
      radiusNm: autoFlightCoverageRadiusNm(focalPoint, boundaryPoints),
    };
  }

  return { _abortActiveUpdates, _flightQuery };
}
