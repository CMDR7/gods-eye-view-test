import * as Cesium from 'cesium';

export const ACQUISITION_MIN_RADIUS_NM = 10;
export const ACQUISITION_MAX_RADIUS_NM = 250;
export const ACQUISITION_MARGIN = 1.1;

const ACQUISITION_SAMPLE_POINTS = [
  [0, 0],
  [0.5, 0],
  [1, 0],
  [1, 0.5],
  [1, 1],
  [0.5, 1],
  [0, 1],
  [0, 0.5],
];
const METERS_PER_NAUTICAL_MILE = 1852;

function pickCartographic(viewer, point) {
  const scene = viewer?.scene;
  const camera = viewer?.camera;
  if (!scene || !camera) return undefined;

  const ray = camera.getPickRay?.(point);
  const ellipsoid = scene.globe?.ellipsoid || Cesium.Ellipsoid.WGS84;
  const globePosition = ray ? scene.globe?.pick(ray, scene) : undefined;
  const position = Cesium.defined(globePosition)
    ? globePosition
    : camera.pickEllipsoid?.(point, ellipsoid);
  return Cesium.defined(position)
    ? Cesium.Cartographic.fromCartesian(position, ellipsoid)
    : undefined;
}

export function acquisitionRadiusNm(viewer, centerCartographic) {
  if (!viewer || !centerCartographic) return ACQUISITION_MAX_RADIUS_NM;
  const canvas = viewer.canvas || viewer.scene?.canvas;
  const width = Number(canvas?.clientWidth);
  const height = Number(canvas?.clientHeight);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return ACQUISITION_MAX_RADIUS_NM;

  let furthestNm = 0;
  for (const [x, y] of ACQUISITION_SAMPLE_POINTS) {
    const point = new Cesium.Cartesian2(width * x, height * y);
    const cartographic = pickCartographic(viewer, point);
    if (!cartographic) continue;
    const geodesic = new Cesium.EllipsoidGeodesic(
      centerCartographic,
      cartographic,
    );
    const distanceNm = geodesic.surfaceDistance / METERS_PER_NAUTICAL_MILE;
    if (Number.isFinite(distanceNm))
      furthestNm = Math.max(furthestNm, distanceNm);
  }

  if (!furthestNm) return ACQUISITION_MAX_RADIUS_NM;
  return Math.min(
    ACQUISITION_MAX_RADIUS_NM,
    Math.max(ACQUISITION_MIN_RADIUS_NM, furthestNm * ACQUISITION_MARGIN),
  );
}

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
    const centerCartographic = pickCartographic(viewer, center);
    return centerCartographic
      ? {
          latitude: Cesium.Math.toDegrees(centerCartographic.latitude),
          longitude: Cesium.Math.toDegrees(centerCartographic.longitude),
          radiusNm: acquisitionRadiusNm(viewer, centerCartographic),
        }
      : {};
  }
  return { _abortActiveUpdates, _flightQuery };
}
