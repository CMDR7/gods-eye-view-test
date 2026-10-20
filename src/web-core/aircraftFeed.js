import { filterFlightsToCoverage } from '../data/flightCoverage.js';

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Parse the shared /api/flights OpenSky-compatible state-vector response and
 * keep only positioned contacts in the requested focal-point coverage circle.
 * The caller owns the small Web Core render budget; this helper owns data
 * validation so malformed rows never poison a partial Cesium update.
 */
export function selectWebCoreAircraft(
  payload,
  focalPoint,
  { radiusNm = 75, maxRows = 100 } = {},
) {
  if (!Array.isArray(payload?.states)) {
    throw new TypeError('Malformed /api/flights response: states missing');
  }

  const candidates = [];
  for (const row of payload.states) {
    if (!Array.isArray(row) || row[0] == null || row[5] == null || row[6] == null)
      continue;

    const hex = String(row[0]).trim().toLowerCase();
    const longitude = finiteNumber(row[5]);
    const latitude = finiteNumber(row[6]);
    if (
      !hex ||
      longitude === null ||
      latitude === null ||
      Math.abs(longitude) > 180 ||
      Math.abs(latitude) > 90
    )
      continue;

    candidates.push({
      id: hex,
      hex,
      latitude,
      longitude,
      altitudeM: finiteNumber(row[7]) ?? 500,
      flight: String(row[1] ?? '').trim(),
      squawk: String(row[14] ?? '').trim(),
      category: finiteNumber(row[17]),
    });
  }

  const limit = Number.isFinite(Number(maxRows))
    ? Math.max(0, Math.floor(Number(maxRows)))
    : 100;
  return filterFlightsToCoverage(candidates, {
    latitude: focalPoint?.latitude,
    longitude: focalPoint?.longitude,
    radiusNm,
  }).slice(0, limit);
}
