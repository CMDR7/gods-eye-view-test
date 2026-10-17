import { normalizeAircraft } from './aircraftProvider.js';
import { attachAircraftMotion } from './aircraftMotion.js';

const ADSB_POINT_PATH = '/v2/point/';
const originalFetch = window.fetch.bind(window);
const normalizedByIcao = new Map();

function isAircraftPointRequest(input) {
  try {
    const url = new URL(typeof input === 'string' ? input : input?.url, window.location.href);
    return url.origin === 'https://api.adsb.lol' && url.pathname.includes(ADSB_POINT_PATH);
  } catch {
    return false;
  }
}

function cacheSnapshot(payload, observedAt) {
  const aircraft = (payload?.ac ?? [])
    .map((raw) => normalizeAircraft(raw, observedAt))
    .filter((item) => item.identity.icaoHex);

  normalizedByIcao.clear();
  for (const item of aircraft) normalizedByIcao.set(item.identity.icaoHex.toUpperCase(), item);

  window.__gevAircraftSnapshot = { observedAt, aircraft };
}

window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (!isAircraftPointRequest(args[0]) || !response.ok) return response;

  try {
    const payload = await response.clone().json();
    cacheSnapshot(payload, new Date().toISOString());
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
