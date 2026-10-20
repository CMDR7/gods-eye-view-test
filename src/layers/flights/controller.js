import * as Cesium from 'cesium';

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

    const center = new Cesium.Cartesian2(width / 2, height / 2);
    const ray = camera.getPickRay?.(center);
    const ellipsoid = scene.globe?.ellipsoid || Cesium.Ellipsoid.WGS84;
    const globePosition = ray ? scene.globe?.pick(ray, scene) : undefined;
    const position = Cesium.defined(globePosition)
      ? globePosition
      : camera.pickEllipsoid?.(center, ellipsoid);
    const cartographic = Cesium.defined(position)
      ? Cesium.Cartographic.fromCartesian(position, ellipsoid)
      : undefined;
    return cartographic
      ? {
          latitude: Cesium.Math.toDegrees(cartographic.latitude),
          longitude: Cesium.Math.toDegrees(cartographic.longitude),
        }
      : {};
  }
  return { _abortActiveUpdates, _flightQuery };
}
