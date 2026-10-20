const SOURCES = [
  ['AIRPLANES.LIVE', 'https://api.airplanes.live/v2'],
  ['ADSB.LOL', 'https://api.adsb.lol/v2'],
];

const MAX_RADIUS_NM = 250;
const ALLOWED_ORIGINS = '*';
const EARTH_RADIUS_KM = 6371;
const NM_TO_KM = 1.852;

function corsHeaders(contentType = 'application/json') {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(),
  });
}

function validCoordinate(value, min, max) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max;
}

function isMilitaryRecord(record) {
  return record?.mil === true
    || record?.military === true
    || /^(true|1|yes|military)$/i.test(String(record?.mil ?? record?.military ?? '').trim());
}

function distanceNm(lat1, lon1, lat2, lon2) {
  const phi1 = Number(lat1) * Math.PI / 180;
  const phi2 = Number(lat2) * Math.PI / 180;
  const deltaPhi = (Number(lat2) - Number(lat1)) * Math.PI / 180;
  const deltaLambda = (Number(lon2) - Number(lon1)) * Math.PI / 180;
  const a = Math.sin(deltaPhi / 2) ** 2
    + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return (EARTH_RADIUS_KM * c) / NM_TO_KM;
}

function filterAircraft(records, mode, lat, lon, radius) {
  return records.filter((record) => {
    const recordLat = Number(record?.lat);
    const recordLon = Number(record?.lon);
    if (!Number.isFinite(recordLat) || !Number.isFinite(recordLon)) return false;
    if (mode === 'civilian' && isMilitaryRecord(record)) return false;
    if (mode === 'military' && distanceNm(lat, lon, recordLat, recordLon) > radius) return false;
    return true;
  });
}

export function selectSuccessfulResult(results) {
  return results.find((result) => result.ok && result.aircraft?.length > 0)
    || results.find((result) => result.ok)
    || null;
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'GET') {
      return json({ error: 'METHOD NOT ALLOWED' }, 405);
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.pathname !== '/aircraft') {
      return json({ error: 'NOT FOUND' }, 404);
    }

    const lat = requestUrl.searchParams.get('lat');
    const lon = requestUrl.searchParams.get('lon');
    const radius = Math.min(MAX_RADIUS_NM, Math.max(1, Number(requestUrl.searchParams.get('radius') || 250)));
    const mode = requestUrl.searchParams.get('mode') === 'military' ? 'military' : 'civilian';

    if (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180) || !Number.isFinite(radius)) {
      return json({ error: 'INVALID AIRCRAFT QUERY' }, 400);
    }

    const numericLat = Number(lat);
    const numericLon = Number(lon);
    const pointPath = `/point/${numericLat.toFixed(4)}/${numericLon.toFixed(4)}/${radius}`;
    const sources = mode === 'military'
      ? [['ADSB.LOL // MILITARY', 'https://api.adsb.lol/v2/mil', true]]
      : SOURCES.map(([provider, base]) => [provider, `${base}${pointPath}`, false]);

    const results = await Promise.all(sources.map(async ([provider, url, militaryFeed]) => {
      try {
        const upstream = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'GEV-Web-Core/1.0 (open-source spatial intelligence client)',
          },
        });

        if (!upstream.ok) {
          return {
            provider,
            ok: false,
            status: upstream.status,
            error: `${provider} ${upstream.status}`,
          };
        }

        const payload = await upstream.json();
        const rawAircraft = Array.isArray(payload?.ac) ? payload.ac : [];
        const aircraft = militaryFeed
          ? filterAircraft(rawAircraft, 'military', numericLat, numericLon, radius)
          : filterAircraft(rawAircraft, mode, numericLat, numericLon, radius);

        return {
          provider,
          ok: true,
          status: upstream.status,
          payload,
          aircraft,
        };
      } catch (error) {
        return {
          provider,
          ok: false,
          status: 0,
          error: `${provider} ${error?.message || 'REQUEST FAILED'}`,
        };
      }
    }));

    const successful = selectSuccessfulResult(results);
    if (successful) {
      return json({
        ...successful.payload,
        ac: successful.aircraft,
        provider: successful.provider,
        classification: mode,
        queriedAt: new Date().toISOString(),
        diagnostics: results.map(result => ({
          provider: result.provider,
          ok: result.ok,
          status: result.status,
          aircraft: result.ok ? result.aircraft.length : 0,
          error: result.ok ? null : result.error,
        })),
      });
    }

    return json({
      error: `AIRCRAFT ${mode.toUpperCase()} SOURCES UNAVAILABLE`,
      ac: [],
      classification: mode,
      queriedAt: new Date().toISOString(),
      diagnostics: results.map(result => ({
        provider: result.provider,
        ok: result.ok,
        status: result.status,
        aircraft: 0,
        error: result.error,
      })),
    }, 503);
  },
};
