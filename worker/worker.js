const SOURCES = [
  {
    name: 'AIRPLANES.LIVE',
    point: (lat, lon, radius) =>
      `https://api.airplanes.live/v2/point/${lat}/${lon}/${radius}`,
  },
  {
    name: 'ADSB.LOL',
    point: (lat, lon, radius) =>
      `https://api.adsb.lol/v2/point/${lat}/${lon}/${radius}`,
  },
];

const MAX_RADIUS_NM = 250;
const DEFAULT_RADIUS_NM = 250;
const UPSTREAM_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const ALLOWED_ORIGINS = '*';
const KNOT_TO_MPS = 0.514444;
const FOOT_TO_M = 0.3048;
const FPM_TO_MPS = 0.00508;

function corsHeaders(contentType = 'application/json') {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  };
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), ...extra },
  });
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampRadius(value) {
  const number = finiteNumber(value);
  if (number === null) return DEFAULT_RADIUS_NM;
  return Math.min(MAX_RADIUS_NM, Math.max(1, number));
}

function validCoordinate(value, min, max) {
  const number = finiteNumber(value);
  return number !== null && number >= min && number <= max ? number : null;
}

function emitterCategory(value) {
  const category = String(value || '').trim().toUpperCase();
  const categories = {
    A1: 2,
    A2: 3,
    A3: 4,
    A4: 5,
    A5: 6,
    A6: 7,
    A7: 8,
    B1: 9,
    B2: 10,
    B3: 11,
    B4: 12,
    B6: 14,
    B7: 15,
  };
  return categories[category] || 0;
}

function normalizeAircraft(aircraft, nowSeconds) {
  const hex = String(aircraft?.hex || '').trim().toLowerCase();
  const latitude = finiteNumber(aircraft?.lat);
  const longitude = finiteNumber(aircraft?.lon);

  if (
    !hex ||
    latitude === null ||
    longitude === null ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  const seenPosition = finiteNumber(aircraft?.seen_pos);
  const seen = finiteNumber(aircraft?.seen);
  const onGround = String(aircraft?.alt_baro ?? '').toLowerCase() === 'ground';
  const barometricFeet = onGround ? null : finiteNumber(aircraft?.alt_baro);
  const geometricFeet = finiteNumber(aircraft?.alt_geom);
  const groundSpeedKnots = finiteNumber(aircraft?.gs);
  const verticalRateFpm =
    finiteNumber(aircraft?.baro_rate) ?? finiteNumber(aircraft?.geom_rate);
  const track = finiteNumber(aircraft?.track);

  return [
    hex,
    String(aircraft?.flight || aircraft?.r || '').trim() || null,
    null,
    seenPosition === null ? null : Math.max(0, nowSeconds - seenPosition),
    seen === null ? null : Math.max(0, nowSeconds - seen),
    longitude,
    latitude,
    barometricFeet === null ? null : barometricFeet * FOOT_TO_M,
    onGround,
    groundSpeedKnots === null ? null : groundSpeedKnots * KNOT_TO_MPS,
    track,
    verticalRateFpm === null ? null : verticalRateFpm * FPM_TO_MPS,
    null,
    geometricFeet === null ? null : geometricFeet * FOOT_TO_M,
    aircraft?.squawk || null,
    aircraft?.spi === 1,
    0,
    emitterCategory(aircraft?.category),
  ];
}

function normalizePointPayload(payload) {
  const rawNow = finiteNumber(payload?.now);
  const nowSeconds =
    rawNow === null
      ? Math.floor(Date.now() / 1000)
      : Math.floor(rawNow > 10_000_000_000 ? rawNow / 1000 : rawNow);

  const aircraft = Array.isArray(payload?.ac) ? payload.ac : [];
  const states = [];
  const emergencyByIcao = {};
  const seenIds = new Set();

  for (const row of aircraft) {
    const state = normalizeAircraft(row, nowSeconds);
    if (!state) continue;
    states.push(state);

    const id = state[0];
    if (!seenIds.has(id) && typeof row?.emergency === 'string') {
      const emergency = row.emergency.trim().toLowerCase();
      if (emergency) emergencyByIcao[id] = emergency;
    }
    seenIds.add(id);
  }

  return {
    time: nowSeconds,
    states,
    ...(Object.keys(emergencyByIcao).length ? { emergencyByIcao } : {}),
  };
}

function normalizeReadsbPayload(payload) {
  return payload && Array.isArray(payload.ac) ? payload : { ac: [] };
}

function selectSuccessfulResult(results) {
  return (
    results.find((result) => result.ok && result.aircraft?.length > 0) ||
    results.find((result) => result.ok) ||
    null
  );
}

async function readJsonCapped(response) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error(`upstream response too large: ${contentLength} bytes`);
  }

  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new Error('upstream response too large');
  }
  return JSON.parse(text);
}

async function fetchJson(url, source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'gods-eye-view-aircraft-relay/1.0',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        ok: false,
        source,
        status: response.status,
        error: `${source} returned HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      source,
      status: response.status,
      payload: await readJsonCapped(response),
    };
  } catch (error) {
    return {
      ok: false,
      source,
      status: 502,
      error:
        error?.name === 'AbortError'
          ? `${source} upstream timeout`
          : `${source} ${error?.message || 'request failed'}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function handleFlights(url) {
  const hasLat = url.searchParams.has('lat');
  const hasLon = url.searchParams.has('lon');

  if (!hasLat && !hasLon) {
    return json({
      error: 'lat and lon are required for the aircraft regional relay',
      source: 'relay',
    }, 400);
  }

  const latitude = validCoordinate(url.searchParams.get('lat'), -90, 90);
  const longitude = validCoordinate(url.searchParams.get('lon'), -180, 180);

  if (latitude === null || longitude === null) {
    return json({ error: 'invalid lat/lon coordinates', source: 'relay' }, 400);
  }

  const radius = clampRadius(url.searchParams.get('radius_nm'));
  const requests = SOURCES.map((source) =>
    fetchJson(source.point(latitude, longitude, radius), source.name),
  );
  const results = await Promise.all(requests);
  const successful = selectSuccessfulResult(results);

  if (!successful) {
    return json(
      {
        error: 'all aircraft upstream sources failed',
        source: 'relay',
        upstream: results.map(({ source, status, error }) => ({
          source,
          status,
          error,
        })),
      },
      502,
    );
  }

  const payload = normalizePointPayload(successful.payload);
  return json(payload, 200, {
    'X-Flight-Source': successful.source,
    'X-Feed-Source': successful.source,
    'X-Flight-Coverage': `${radius}nm focal-point coverage`,
  });
}

async function handleMilitary() {
  const result = await fetchJson(
    'https://api.adsb.lol/v2/mil',
    'ADSB.LOL',
  );

  if (!result.ok) {
    return json(
      {
        error: 'military aircraft upstream failed',
        source: result.source,
        upstreamStatus: result.status,
      },
      result.status || 502,
    );
  }

  const payload = normalizeReadsbPayload(result.payload);
  const observedAt = finiteNumber(payload.now);
  const observedAtSeconds =
    observedAt === null
      ? Math.floor(Date.now() / 1000)
      : Math.floor(observedAt > 10_000_000_000 ? observedAt / 1000 : observedAt);
  const body = {
    ...payload,
    now: observedAtSeconds,
  };

  return json(body, 200, {
    'X-Feed-Source': 'ADSB.LOL',
    'X-Feed-Cache': 'MISS',
    'X-Feed-Age-Ms': '0',
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405, {
        Allow: 'GET, OPTIONS',
      });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({
        ok: true,
        service: 'gev-aircraft-relay',
        version: 'github-relay-v1',
        routes: ['/api/flights', '/api/military'],
      });
    }

    if (url.pathname === '/api/flights') {
      return handleFlights(url);
    }

    if (url.pathname === '/api/military') {
      return handleMilitary();
    }

    return json({ error: 'NOT FOUND' }, 404);
  },
};
