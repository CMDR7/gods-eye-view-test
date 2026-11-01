const SOURCES = [
  { name: 'ADSB.FI', point: (lat, lon, radius) => `https://opendata.adsb.fi/api/v3/lat/${lat}/lon/${lon}/dist/${radius}` },
  { name: 'ADSB.LOL', point: (lat, lon, radius) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${radius}` },
  { name: 'AIRPLANES.LIVE', point: (lat, lon, radius) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${radius}` },
];

const MAX_RADIUS_NM = 250;
const DEFAULT_RADIUS_NM = 100;
const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const ALLOWED_ORIGINS = '*';

function corsHeaders(contentType = 'application/json') {
  return { 'Access-Control-Allow-Origin': ALLOWED_ORIGINS, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store', 'Content-Type': contentType };
}
function json(data, status = 200, extra = {}) { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(), ...extra } }); }
function finiteNumber(value) { if (value === null || value === undefined || value === '') return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function clampRadius(value) { const number = finiteNumber(value); if (number === null) return DEFAULT_RADIUS_NM; return Math.min(MAX_RADIUS_NM, Math.max(1, number)); }
function validCoordinate(value, min, max) { const number = finiteNumber(value); return number !== null && number >= min && number <= max ? number : null; }
async function readJsonCapped(response) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error(`upstream response too large: ${contentLength} bytes`);
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error('upstream response too large');
  return JSON.parse(text);
}
async function fetchJson(url, source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'gods-eye-view-aircraft-relay/1.1 (+https://github.com/CMDR7/gods-eye-view-test)' }, signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return { ok: false, source, status: response.status, error: `${source} returned HTTP ${response.status}` };
    return { ok: true, source, status: response.status, payload: await readJsonCapped(response) };
  } catch (error) {
    return { ok: false, source, status: 502, error: error?.name === 'AbortError' ? `${source} upstream timeout` : `${source} ${error?.message || 'request failed'}` };
  } finally { clearTimeout(timeout); }
}
async function fetchFirstSuccessful(sources) {
  const diagnostics = [];
  for (const source of sources) {
    const result = await fetchJson(source.point(source.lat, source.lon, source.radius), source.name);
    diagnostics.push({ source: result.source, status: result.status, ok: result.ok, ...(result.error ? { error: result.error } : {}) });
    if (result.ok && Array.isArray(result.payload?.ac)) return { ...result, diagnostics };
  }
  return { ok: false, diagnostics };
}
async function handleAircraft(url) {
  const latitude = validCoordinate(url.searchParams.get('lat'), -90, 90);
  const longitude = validCoordinate(url.searchParams.get('lon'), -180, 180);
  const mode = String(url.searchParams.get('mode') || 'civilian').toLowerCase();
  const radius = clampRadius(url.searchParams.get('radius'));
  if (latitude === null || longitude === null) return json({ error: 'invalid lat/lon coordinates', source: 'relay' }, 400);
  if (mode === 'military') {
    const result = await fetchJson('https://opendata.adsb.fi/api/v2/mil', 'ADSB.FI // MILITARY');
    if (!result.ok) return json({ error: 'military aircraft upstream failed', source: result.source, upstreamStatus: result.status, diagnostics: [{ source: result.source, status: result.status, error: result.error }] }, result.status || 502);
    return json({ ...result.payload, provider: result.source, classification: 'military', queriedAt: new Date().toISOString(), diagnostics: [{ source: result.source, status: result.status, ok: true }] }, 200, { 'X-Flight-Source': result.source, 'X-Flight-Coverage': `${radius}nm focal-point coverage` });
  }
  if (mode !== 'civilian') return json({ error: 'invalid aircraft mode; expected civilian or military', source: 'relay' }, 400);
  const sources = SOURCES.map((source) => ({ ...source, lat: latitude, lon: longitude, radius }));
  const result = await fetchFirstSuccessful(sources);
  if (!result.ok) return json({ error: 'all aircraft upstream sources failed', source: 'relay', classification: 'civilian', diagnostics: result.diagnostics }, 502);
  return json({ ...result.payload, provider: result.source, classification: 'civilian', queriedAt: new Date().toISOString(), diagnostics: result.diagnostics }, 200, { 'X-Flight-Source': result.source, 'X-Feed-Source': result.source, 'X-Flight-Coverage': `${radius}nm focal-point coverage` });
}
async function handleFlights(url) {
  const latitude = validCoordinate(url.searchParams.get('lat'), -90, 90);
  const longitude = validCoordinate(url.searchParams.get('lon'), -180, 180);
  if (latitude === null || longitude === null) return json({ error: 'invalid lat/lon coordinates', source: 'relay' }, 400);
  const radius = clampRadius(url.searchParams.get('radius_nm'));
  const result = await fetchFirstSuccessful(SOURCES.map((source) => ({ ...source, lat: latitude, lon: longitude, radius })));
  if (!result.ok) return json({ error: 'all aircraft upstream sources failed', source: 'relay', upstream: result.diagnostics }, 502);
  return json(result.payload, 200, { 'X-Flight-Source': result.source, 'X-Feed-Source': result.source, 'X-Flight-Coverage': `${radius}nm focal-point coverage` });
}
async function handleMilitary() {
  const result = await fetchJson('https://opendata.adsb.fi/api/v2/mil', 'ADSB.FI');
  if (!result.ok) return json({ error: 'military aircraft upstream failed', source: result.source, upstreamStatus: result.status }, result.status || 502);
  return json(result.payload, 200, { 'X-Feed-Source': 'ADSB.FI' });
}
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, { Allow: 'GET, OPTIONS' });
    if (url.pathname === '/' || url.pathname === '/health') return json({ ok: true, service: 'gev-aircraft-relay', version: 'github-relay-v3', routes: ['/aircraft', '/api/flights', '/api/military'], civilianSources: SOURCES.map((source) => source.name), militarySource: 'ADSB.FI' });
    if (url.pathname === '/aircraft') return handleAircraft(url);
    if (url.pathname === '/api/flights') return handleFlights(url);
    if (url.pathname === '/api/military') return handleMilitary();
    return json({ error: 'NOT FOUND' }, 404);
  },
};
