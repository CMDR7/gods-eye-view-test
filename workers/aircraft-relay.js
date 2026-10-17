const SOURCES = [
  ['AIRPLANES.LIVE', 'https://api.airplanes.live/v2'],
  ['ADSB.LOL', 'https://api.adsb.lol/v2'],
];

const MAX_RADIUS_NM = 250;
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

    if (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180) || !Number.isFinite(radius)) {
      return json({ error: 'INVALID AIRCRAFT QUERY' }, 400);
    }

    const path = `/point/${Number(lat).toFixed(4)}/${Number(lon).toFixed(4)}/${radius}`;
    const results = await Promise.all(SOURCES.map(async ([provider, base]) => {
      try {
        const upstream = await fetch(`${base}${path}`, {
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
        const aircraft = Array.isArray(payload?.ac) ? payload.ac : [];

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

    const successful = results.find(result => result.ok);
    if (successful) {
      return json({
        ...successful.payload,
        ac: successful.aircraft,
        provider: successful.provider,
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
      error: 'AIRCRAFT SOURCES UNAVAILABLE',
      ac: [],
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
