const CACHE_KEY = 'gev.cityGeocodeCache.v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1100;
let lastRequestAt = 0;
let requestInFlight = false;

const $ = (id) => document.getElementById(id);

function setState(message, type = 'info') {
  const el = $('coordinateState');
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Caching is optional; geocoding still works without it.
  }
}

function getCachedResult(query) {
  const entry = readCache()[query];
  if (!entry || Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
  return entry.result;
}

function cacheResult(query, result) {
  const cache = readCache();
  cache[query] = { timestamp: Date.now(), result };
  writeCache(cache);
}

async function geocodeCity(query) {
  const cached = getCachedResult(query);
  if (cached) return cached;

  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) => window.setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();

  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    featuretype: 'settlement',
    addressdetails: '1',
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    mode: 'cors',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`GEOCODER ${response.status}`);
  const results = await response.json();
  const result = results?.[0];
  if (!result) throw new Error('CITY OR PLACE NOT FOUND');

  const lat = Number(result.lat);
  const lon = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('GEOCODER RETURNED INVALID COORDINATES');

  const normalized = {
    lat,
    lon,
    name: result.display_name || query,
  };
  cacheResult(query, normalized);
  return normalized;
}

async function flyToCity() {
  const input = $('coordinateCity');
  const button = $('cityFly');
  const query = input.value.trim();
  if (!query || requestInFlight) {
    if (!query) setState('ENTER A CITY OR PLACE', 'warn');
    return;
  }

  requestInFlight = true;
  button.disabled = true;
  setState(`GEOCODING // ${query.toUpperCase()}`);

  try {
    const result = await geocodeCity(query.toLowerCase());
    $('coordinateLat').value = result.lat.toFixed(6);
    $('coordinateLon').value = result.lon.toFixed(6);
    setState(`CITY LOCKED // ${result.name}`, 'ok');
    $('coordinateFly').click();
  } catch (error) {
    console.warn('[GEV] City geocoding unavailable', error);
    setState(`CITY NAV ERROR // ${error.message}`, 'warn');
  } finally {
    requestInFlight = false;
    button.disabled = false;
  }
}

function addCityNavigationControls() {
  const input = $('coordinateCity');
  const button = $('cityFly');
  if (!input || !button) return;
  button.addEventListener('click', flyToCity);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') flyToCity();
  });
}

addCityNavigationControls();
