/**
 * Shared acquisition-coverage policy for live civilian aircraft.
 *
 * The radius is measured from the geographic point under the viewport centre,
 * using the sampled ground footprint of the visible viewport.
 */
export const FLIGHT_COVERAGE_MIN_RADIUS_NM = 10;
export const FLIGHT_COVERAGE_MAX_RADIUS_NM = 250;
export const FLIGHT_COVERAGE_AUTO_MARGIN = 1.15;
export const FLIGHT_COVERAGE_AUTO_PADDING_NM = 5;

const EARTH_RADIUS_NM = 3440.065;

function validCoordinate(point) {
  return (
    Number.isFinite(point?.latitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    Number.isFinite(point?.longitude) &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

export function clampFlightCoverageRadiusNm(
  value,
  fallback = FLIGHT_COVERAGE_MAX_RADIUS_NM,
) {
  const parsed =
    value === null || value === undefined || value === ''
      ? NaN
      : Number(value);
  const safeValue = Number.isFinite(parsed) ? parsed : fallback;
  return Math.round(
    Math.min(
      FLIGHT_COVERAGE_MAX_RADIUS_NM,
      Math.max(FLIGHT_COVERAGE_MIN_RADIUS_NM, safeValue),
    ),
  );
}

/**
 * Great-circle distance between { latitude, longitude } points in nautical
 * miles.
 */
export function flightDistanceNm(origin, destination) {
  if (!validCoordinate(origin) || !validCoordinate(destination))
    return Infinity;

  const radians = (degrees) => (degrees * Math.PI) / 180;
  const lat1 = radians(origin.latitude);
  const lat2 = radians(destination.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLonDegrees =
    ((destination.longitude - origin.longitude + 540) % 360) - 180;
  const deltaLon = radians(deltaLonDegrees);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const haversine =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;

  return (
    2 *
    EARTH_RADIUS_NM *
    Math.asin(Math.min(1, Math.sqrt(Math.max(0, haversine))))
  );
}

/**
 * Cover the visible viewport footprint, add a small safety margin, and stay
 * inside the provider's supported 10–250 NM range. With no usable boundary
 * intersections, use the conservative provider maximum rather than guessing
 * that the viewport is tightly zoomed.
 */
export function autoFlightCoverageRadiusNm(focalPoint, boundaryPoints = []) {
  if (!validCoordinate(focalPoint)) return FLIGHT_COVERAGE_MAX_RADIUS_NM;

  let farthestNm = 0;
  let intersections = 0;
  for (const point of boundaryPoints) {
    const distance = flightDistanceNm(focalPoint, point);
    if (!Number.isFinite(distance)) continue;
    farthestNm = Math.max(farthestNm, distance);
    intersections += 1;
  }

  if (intersections === 0) return FLIGHT_COVERAGE_MAX_RADIUS_NM;
  return clampFlightCoverageRadiusNm(
    Math.ceil(
      farthestNm * FLIGHT_COVERAGE_AUTO_MARGIN +
        FLIGHT_COVERAGE_AUTO_PADDING_NM,
    ),
  );
}

/**
 * Keep only positioned aircraft inside the current focal-point coverage
 * circle.
 */
export function filterFlightsToCoverage(records, query) {
  if (
    !Array.isArray(records) ||
    !validCoordinate(query) ||
    !Number.isFinite(query.radiusNm)
  )
    return records;

  const radiusNm = clampFlightCoverageRadiusNm(query.radiusNm);
  return records.filter(
    (record) =>
      validCoordinate(record) && flightDistanceNm(query, record) <= radiusNm,
  );
}
