import * as Cesium from 'cesium';
import { getKeyholeGeometry } from '../celestialRing.js';

export const AIRCRAFT_COVERAGE_MIN_RADIUS_NM = 1;
export const AIRCRAFT_COVERAGE_MAX_RADIUS_NM = 250;
export const AIRCRAFT_COVERAGE_MARGIN = 1.1;
export const AIRCRAFT_COVERAGE_FALLBACK_RADIUS_NM = 75;

const EARTH_RADIUS_KM = 6371;
const KM_PER_NM = 1.852;
const DEFAULT_BOUNDARY_SAMPLES = 16;
const MIN_VALID_BOUNDARY_SAMPLES = 4;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isValidCoordinate(point) {
  return Number.isFinite(point?.latitude)
    && point.latitude >= -90
    && point.latitude <= 90
    && Number.isFinite(point?.longitude)
    && point.longitude >= -180
    && point.longitude <= 180;
}

export function distanceNm(first, second) {
  if (!isValidCoordinate(first) || !isValidCoordinate(second)) return Number.NaN;

  const phi1 = Cesium.Math.toRadians(first.latitude);
  const phi2 = Cesium.Math.toRadians(second.latitude);
  const deltaPhi = Cesium.Math.toRadians(second.latitude - first.latitude);
  const deltaLambda = Cesium.Math.toRadians(second.longitude - first.longitude);
  const a = Math.sin(deltaPhi / 2) ** 2
    + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const centralAngle = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return (EARTH_RADIUS_KM * centralAngle) / KM_PER_NM;
}

/**
 * Derive a conservative circle around the focal point from valid aperture-edge
 * intersections. Sparse/horizon-clipped samples use a documented fallback.
 */
export function computeAircraftCoverageRadiusNm(
  focalPoint,
  boundaryPoints,
  {
    margin = AIRCRAFT_COVERAGE_MARGIN,
    fallbackRadiusNm = AIRCRAFT_COVERAGE_FALLBACK_RADIUS_NM,
    minRadiusNm = AIRCRAFT_COVERAGE_MIN_RADIUS_NM,
    maxRadiusNm = AIRCRAFT_COVERAGE_MAX_RADIUS_NM,
    minValidSamples = MIN_VALID_BOUNDARY_SAMPLES,
  } = {},
) {
  const minimum = clamp(Number(minRadiusNm) || AIRCRAFT_COVERAGE_MIN_RADIUS_NM, 1, 250);
  const maximum = clamp(Number(maxRadiusNm) || AIRCRAFT_COVERAGE_MAX_RADIUS_NM, minimum, 250);
  const fallback = clamp(
    Math.ceil(Number(fallbackRadiusNm) || AIRCRAFT_COVERAGE_FALLBACK_RADIUS_NM),
    minimum,
    maximum,
  );
  if (!isValidCoordinate(focalPoint) || !Array.isArray(boundaryPoints)) return fallback;

  const distances = boundaryPoints
    .filter(isValidCoordinate)
    .map((point) => distanceNm(focalPoint, point))
    .filter(Number.isFinite);
  if (distances.length < Math.max(1, Number(minValidSamples) || MIN_VALID_BOUNDARY_SAMPLES)) {
    return fallback;
  }

  const farthest = Math.max(...distances);
  const marginFactor = Number.isFinite(margin) && margin >= 1
    ? margin
    : AIRCRAFT_COVERAGE_MARGIN;
  return clamp(Math.ceil(farthest * marginFactor), minimum, maximum);
}

function pickSurfacePoint(scene, camera, x, y) {
  const position = new Cesium.Cartesian2(x, y);
  const ray = camera.getPickRay?.(position);
  let cartesian = ray ? scene.globe?.pick?.(ray, scene) : undefined;
  if (!Cesium.defined(cartesian)) {
    cartesian = camera.pickEllipsoid?.(
      position,
      scene.globe?.ellipsoid || Cesium.Ellipsoid.WGS84,
    );
  }
  if (!Cesium.defined(cartesian)) return null;

  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  const point = {
    latitude: Cesium.Math.toDegrees(cartographic.latitude),
    longitude: Cesium.Math.toDegrees(cartographic.longitude),
  };
  return isValidCoordinate(point) ? point : null;
}

/**
 * Resolve a geographic focal point and acquisition radius from the same
 * circular aperture used by the scope mask and keyhole-aligned overlays.
 */
export function getAircraftApertureCoverage(
  viewer,
  { sampleCount = DEFAULT_BOUNDARY_SAMPLES } = {},
) {
  const scene = viewer?.scene;
  const camera = viewer?.camera;
  const canvas = viewer?.canvas || scene?.canvas;
  const width = Number(canvas?.clientWidth);
  const height = Number(canvas?.clientHeight);
  if (!scene?.globe || !camera || !(width > 0) || !(height > 0)) return null;

  const geometry = getKeyholeGeometry(width, height);
  if (!(geometry.radius > 0)) return null;

  const focalPoint = pickSurfacePoint(scene, camera, geometry.centerX, geometry.centerY);
  if (!focalPoint) return null;

  const count = clamp(Math.trunc(Number(sampleCount) || DEFAULT_BOUNDARY_SAMPLES), 8, 64);
  const maxX = Math.max(0, width - 1);
  const maxY = Math.max(0, height - 1);
  const seenPixels = new Set();
  const boundaryPoints = [];

  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count;
    const x = clamp(geometry.centerX + Math.cos(angle) * geometry.radius, 0, maxX);
    const y = clamp(geometry.centerY + Math.sin(angle) * geometry.radius, 0, maxY);
    const pixelKey = `${x.toFixed(2)}:${y.toFixed(2)}`;
    if (seenPixels.has(pixelKey)) continue;
    seenPixels.add(pixelKey);

    const point = pickSurfacePoint(scene, camera, x, y);
    if (point) boundaryPoints.push(point);
  }

  const radiusNm = computeAircraftCoverageRadiusNm(focalPoint, boundaryPoints);
  return {
    ...focalPoint,
    radiusNm,
    boundarySampleCount: boundaryPoints.length,
  };
}
