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

async function readJsonCapped(response) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error(`upstream response too large: ${contentLength} bytes`);
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error('upstream response too large');
  return JSON.parse(text);
}

async function fetchJson(url, source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 'gods-eye-view-aircraft-relay/1.0' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      return { ok: false, source, status: response.status, error: `${source} returned HTTP ${response.status}` };
    }
    return { ok: true, source, status: response.status, payload: await readJsonCapped(response) };
  } catch (error) {
    return {
      ok: false,
      source,
      status: 502,
      error: error?.name === 'AbortError' ? `${source} upstream timeout` : `${source} ${error?.message || 'request failed'}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function successfulResult(results) {
  return (
    results.find((result) => result.ok && Array.isArray(result.payload?.ac) && result.payload.ac.length > 0) ||
    results.find((result) => result.ok && Array.isArray(result.payload?.ac)) ||
    null
  );
}

async function handleAircraft(url) {
  const latitude = validCoordinate(url.searchParams.get('lat'), -90, 90);
  const longitude = validCoordinate(url.searchParams.get('lon'), -180, 180);
  const mode = String(url.searchParams.get('mode') || 'civilian').toLowerCase();
  const radius = clampRadius(url.searchParams.get('radius'));

  if (latitude === null || longitude === null) {
    return json({ error: 'invalid lat/lon coordinates', source: 'relay' }, 400);
  }

  if (mode === 'military') {
    const result = await fetchJson('https://api.adsb.lol/v2/mil', 'ADSB.LOL // MILITARY');
    if (!result.ok) {
      return json({
        error: 'military aircraft upstream failed',
        source: result.source,
        upstreamStatus: result.status,
        diagnostics: [{ source: result.source, status: result.status, error: result.error }],
      }, result.status || 502);
    }
    return json({
      ...result.payload,
      provider: result.source,
      classification: 'military',
      queriedAt: new Date().toISOString(),
      diagnostics: [{ source: result.source, status: result.status, ok: true }],
    }, 200, {
      'X-Flight-Source': result.source,
      'X-Flight-Coverage': `${radius}nm focal-point coverage`,
    });
  }

  if (mode !== 'civilian') {
    return json({ error: 'invalid aircraft mode; expected civilian or military', source: 'relay' }, 400);
  }

  const results = await Promise.all(
    SOURCES.map((source) => fetchJson(source.point(latitude, longitude, radius), source.name)),
  );
  const successful = successfulResult(results);

  if (!successful) {
    return json({
      error: 'all aircraft upstream sources failed',
      source: 'relay',
      classification: 'civilian',
      diagnostics: results.map(({ source, status, error }) => ({ source, status, error })),
    }, 502);
  }

  return json({
    ...successful.payload,
    provider: successful.source,
    classification: 'civilian',
    queriedAt: new Date().toISOString(),
    diagnostics: results.map(({ source, status, ok, error }) => ({ source, status, ok, ...(error ? { error } : {}) })),
  }, 200, {
    'X-Flight-Source': successful.source,
    'X-Feed-Source': successful.source,
    'X-Flight-Coverage': `${radius}nm focal-point coverage`,
  });
}

async function handleFlights(url) {
  const latitude = validCoordinate(url.searchParams.get('lat'), -90, 90);
  const longitude = validCoordinate(url.searchParams.get('lon'), -180, 180);
  if (latitude === null || longitude === null) {
    return json({ error: 'invalid lat/lon coordinates', source: 'relay' }, 400);
  }
  const radius = clampRadius(url.searchParams.get('radius_nm'));
  const results = await Promise.all(
    SOURCES.map((source) => fetchJson(source.point(latitude, longitude, radius), source.name)),
  );
  const successful = successfulResult(results);
  if (!successful) {
    return json({
      error: 'all aircraft upstream sources failed',
      source: 'relay',
      upstream: results.map(({ source, status, error }) => ({ source, status, error })),
    }, 502);
  }
  return json(successful.payload, 200, {
    'X-Flight-Source': successful.source,
    'X-Feed-Source': successful.source,
    'X-Flight-Coverage': `${radius}nm focal-point coverage`,
  });
}

async function handleMilitary() {
  const result = await fetchJson('https://api.adsb.lol/v2/mil', 'ADSB.LOL');
  if (!result.ok) {
    return json({ error: 'military aircraft upstream failed', source: result.source, upstreamStatus: result.status }, result.status || 502);
  }
  return json(result.payload, 200, { 'X-Feed-Source': 'ADSB.LOL' });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, { Allow: 'GET, OPTIONS' });

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({
        ok: true,
        service: 'gev-aircraft-relay',
        version: 'github-relay-v2',
        routes: ['/aircraft', '/api/flights', '/api/military'],
      });
    }
    if (url.pathname === '/aircraft') return handleAircraft(url);
    if (url.pathname === '/api/flights') return handleFlights(url);
    if (url.pathname === '/api/military') return handleMilitary();
    return json({ error: 'NOT FOUND' }, 404);
  },
};
