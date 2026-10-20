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
    const lastX = Math.max(0, width - 1);
    const lastY = Math.max(0, height - 1);
    const edgeSteps = 8;
    for (let index = 0; index <= edgeSteps; index += 1) {
      const fraction = index / edgeSteps;
      const x = fraction * lastX;
      const y = fraction * lastY;
      const samples = [
        [x, 0],
        [x, lastY],
        [0, y],
        [lastX, y],
      ];
      for (const [sampleX, sampleY] of samples) {
        const point = _screenCartographic(
          scene,
          camera,
          ellipsoid,
          sampleX,
          sampleY,
        );
        if (point) boundaryPoints.push(point);
      }
    }

    return {
      ...focalPoint,
      radiusNm: autoFlightCoverageRadiusNm(focalPoint, boundaryPoints),
    };
  }

  return { _abortActiveUpdates, _flightQuery };
}
