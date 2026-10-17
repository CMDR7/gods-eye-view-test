import { normalizeAircraft } from './aircraftProvider.js';
import { attachAircraftMotion } from './aircraftMotion.js';

const ADSB_POINT_PATH = '/v2/point/';
const ADSB_LOL_ORIGIN = 'https://api.adsb.lol';
const AIRPLANES_LIVE_ORIGIN = 'https://api.airplanes.live';
const originalFetch = window.fetch.bind(window);
const normalizedByIcao = new Map();

function getUrl(input) {
  try {
    return new URL(typeof input === 'string' ? input : input?.url, window.location.href);
  } catch {
    return null;
  }
}

function isAircraftPointRequest(input) {
  const url = getUrl(input);
  return Boolean(url && (url.origin === ADSB_LOL_ORIGIN || url.origin === AIRPLANES_LIVE_ORIGIN) && url.pathname.includes(ADSB_POINT_PATH));
}

function buildFallbackInput(input) {
  const url = getUrl(input);
  if (!url || url.origin !== ADSB_LOL_ORIGIN || !url.pathname.includes(ADSB_POINT_PATH)) return null;
  url.origin = AIRPLANES_LIVE_ORIGIN;
  return typeof input === 'string' ? url.toString() : new Request(url.toString(), input);
}

async function responseAircraftCount(response) {
  try {
    const payload = await response.clone().json();
    return Array.isArray(payload?.ac) ? payload.ac.length : 0;
  } catch {
    return 0;
  }
}

async function fetchAircraft(input, init) {
  try {
    const response = await originalFetch(input, init);
    if (response.ok) {
      const count = await responseAircraftCount(response);
      if (count > 0) {
        return { response, provider: 'ADSB.LOL' };
      }

      // A successful empty response is still a usable HTTP response, but for
      // a live aircraft layer it is worth checking the browser-safe mirror
      // before declaring the layer empty. This also makes provider failure
      // transparent to the rest of the GEV layer pipeline.
      const fallback = buildFallbackInput(input);
      if (fallback) {
        const fallbackResponse = await originalFetch(fallback, init);
        if (fallbackResponse.ok && await responseAircraftCount(fallbackResponse) > 0) {
          return { response: fallbackResponse, provider: 'AIRPLANES.LIVE' };
        }
      }
      return { response, provider: 'ADSB.LOL' };
    }

    const fallback = buildFallbackInput(input);
    if (!fallback) return { response, provider: 'ADSB.LOL' };
    const fallbackResponse = await originalFetch(fallback, init);
    return { response: fallbackResponse, provider: 'AIRPLANES.LIVE' };
  } catch (error) {
    const fallback = buildFallbackInput(input);
    if (!fallback) throw error;
    const fallbackResponse = await originalFetch(fallback, init);
    return { response: fallbackResponse, provider: 'AIRPLANES.LIVE' };
  }
}

function cacheSnapshot(payload, observedAt, provider) {
  const aircraft = (payload?.ac ?? [])
    .map((raw) => normalizeAircraft(raw, observedAt))
    .filter((item) => item.identity.icaoHex);

  normalizedByIcao.clear();
  for (const item of aircraft) normalizedByIcao.set(item.identity.icaoHex.toUpperCase(), item);

  window.__gevAircraftProvider = provider;
  window.__gevAircraftSnapshot = { observedAt, provider, aircraft };
}

window.fetch = async (...args) => {
  const input = args[0];
  if (!isAircraftPointRequest(input)) return originalFetch(...args);

  const { response, provider } = await fetchAircraft(input, args[1]);
  if (!response.ok) return response;

  try {
    const payload = await response.clone().json();
    cacheSnapshot(payload, new Date().toISOString(), provider);
    enrichCurrentLayer();
  } catch (error) {
    console.warn('[GEV] Aircraft normalization bridge skipped', error);
  }
  return response;
};

function enrichEntity(entity) {
  const hex = String(entity?.gevMeta?.hex || '').toUpperCase();
  if (!hex) return;
  const aircraft = normalizedByIcao.get(hex);
  if (!aircraft) return;

  entity.gevMeta.aircraft = aircraft;
  entity.gevMeta.identity = aircraft.identity;
  entity.gevMeta.position = aircraft.position;
  entity.gevMeta.motion = aircraft.motion;
  entity.gevMeta.navigation = aircraft.navigation;
  entity.gevMeta.signal = aircraft.signal;
  entity.gevMeta.integrity = aircraft.integrity;
  entity.gevMeta.flags = aircraft.flags;
  entity.gevMeta.transponder = aircraft.transponder;
  entity.gevMeta.environment = aircraft.environment;
  entity.gevMeta.updated = aircraft.sourceRecord.updatedAt;
  entity.gevMeta.source = window.__gevAircraftProvider || entity.gevMeta.source;
  entity.gevMeta.altitude = aircraft.position.altitudeBarometricM ?? aircraft.position.altitudeGeometricM ?? entity.gevMeta.altitude;

  attachAircraftMotion(entity);
}

function enrichCurrentLayer() {
  const scene = document.querySelector('#globe canvas')?.__gevScene || null;
  const layer = scene?.__gevWebCoreLayers?.get('aircraft');
  if (!layer) return;
  for (const entity of layer.dataSource.entities.values) enrichEntity(entity);
}

function install(attempt = 0) {
  const scene = document.querySelector('#globe canvas')?.__gevScene || null;
  const layer = scene?.__gevWebCoreLayers?.get('aircraft');
  if (layer) {
    layer.dataSource.entities.collectionChanged.addEventListener((_collection, added) => {
      for (const entity of added) enrichEntity(entity);
    });
    enrichCurrentLayer();
    return;
  }
  if (attempt < 600) requestAnimationFrame(() => install(attempt + 1));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => install(), { once: true });
} else {
  install();
}
