import * as Cesium from 'cesium';
import * as satellite from 'satellite.js';
import { createOsmImagery } from '../maps/imagery.js';
import { applyStoredIonToken, clearIonToken, getIonTokenStatus, saveIonToken } from './ionToken.js';
import { fetchAircraftSnapshot } from './aircraftProvider.js';
import { attachAircraftMotion } from './aircraftMotion.js';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';

const REFRESH_MS = 60_000;
const SATELLITE_REFRESH_MS = 2 * 60 * 60 * 1000;
const MAX_SATELLITES = 1500;
const ION_TERRAIN_TIMEOUT_MS = 15_000;
const DRAWER_TRANSITION_MS = 320;
const DEFAULT_NAV_ALTITUDE = 15_000;
const SATELLITE_CACHE_KEY = 'gev.celestrak.visualTle.v1';
const SATELLITE_CACHE_TTL_MS = SATELLITE_REFRESH_MS;
const SATELLITE_COLLECTION_KEY = '__gevSatellitePointCollection';

const state = {
  viewer: null,
  layers: new Map(),
  timers: new Map(),
  ionTerrainEnabled: false,
  commandPanelOpen: false,
  selectedEntity: null,
  selectedLayerId: null,
};

applyStoredIonToken();

const $ = (id) => document.getElementById(id);

function setStatus(message, type = 'info') {
  const el = $('status');
  el.textContent = message;
  el.dataset.type = type;
}

function addLayer(id, name, color) {
  const dataSource = new Cesium.CustomDataSource(id);
  state.viewer.dataSources.add(dataSource);
  state.layers.set(id, { id, name, color, dataSource, enabled: false });
  return state.layers.get(id);
}

function clearLayer(id) {
  const layer = state.layers.get(id);
  if (!layer) return;
  if (state.selectedLayerId === id) clearSelectedTarget();
  layer.dataSource.entities.removeAll();
}

function setLayerEnabled(id, enabled) {
  const layer = state.layers.get(id);
  if (!layer) return;
  layer.enabled = enabled;
  layer.dataSource.show = enabled;
  if (id === 'satellites') {
    const collection = state.viewer.scene[SATELLITE_COLLECTION_KEY];
    if (collection) collection.show = enabled;
  }
  document.querySelector(`[data-layer="${id}"]`)?.classList.toggle('active', enabled);
}

function addPoint(layer, lon, lat, height, label, color, pixelSize = 7, metadata = {}) {
  const entity = layer.dataSource.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lon, lat, height || 0),
    point: {
      pixelSize,
      color,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 1,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: label
      ? {
          text: label,
          font: '11px monospace',
          fillColor: color,
          showBackground: true,
          backgroundColor: Cesium.Color.BLACK.withAlpha(0.72),
          pixelOffset: new Cesium.Cartesian2(9, 0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          show: false,
        }
      : undefined,
  });

  entity.gevMeta = {
    layerId: layer.id,
    type: metadata.type || layer.name,
    name: metadata.name || label || layer.name,
    id: metadata.id || entity.id,
    source: metadata.source || 'GEV WEB CORE',
    updated: metadata.updated || new Date().toISOString(),
    altitude: Number.isFinite(metadata.altitude) ? metadata.altitude : height || 0,
    ...metadata,
  };
  entity.gevVisual = { color, pixelSize };
  return entity;
}

function syncSatellitePoints(layer) {
  const scene = state.viewer.scene;
  let collection = scene[SATELLITE_COLLECTION_KEY];
  if (!collection) {
    collection = scene.primitives.add(new Cesium.PointPrimitiveCollection());
    scene[SATELLITE_COLLECTION_KEY] = collection;
  }

  collection.removeAll();
  collection.show = layer.enabled;

  for (const entity of layer.dataSource.entities.values) {
    if (!entity?.gevMeta || entity.gevMeta.type !== 'SATELLITE') continue;
    const position = entity.position?.getValue(Cesium.JulianDate.now());
    if (!Cesium.defined(position)) continue;
    const point = collection.add({
      position,
      pixelSize: entity.gevVisual?.pixelSize || 7,
      color: entity.gevVisual?.color || Cesium.Color.LIME,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 1,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      id: entity,
    });
    entity.__gevSatellitePoint = point;
  }

  scene.requestRender();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { mode: 'cors', ...options });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function loadEarthquakes() {
  const layer = state.layers.get('earthquakes');
  clearLayer('earthquakes');
  const feed = await fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
  const updated = new Date().toISOString();
  for (const feature of feed.features ?? []) {
    const [lon, lat, depth = 0] = feature.geometry?.coordinates ?? [];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const mag = Number(feature.properties?.mag ?? 0);
    const color = mag >= 5 ? Cesium.Color.RED : mag >= 3 ? Cesium.Color.ORANGE : Cesium.Color.YELLOW;
    const place = feature.properties?.place ?? 'UNKNOWN LOCATION';
    addPoint(layer, lon, lat, 0, `M${mag.toFixed(1)} ${place}`.trim(), color, Math.min(14, 4 + mag * 1.4), {
      type: 'EARTHQUAKE', name: place, id: feature.id || 'USGS EVENT', source: 'USGS', updated,
      magnitude: mag, depth: Number.isFinite(Number(depth)) ? Number(depth) : 0, altitude: 0,
    });
  }
  return feed.metadata?.count ?? layer.dataSource.entities.values.length;
}

function getAircraftQueryPoint() {
  const scene = state.viewer.scene;
  const camera = state.viewer.camera;
  const canvas = scene.canvas;
  const center = new Cesium.Cartesian2(canvas.clientWidth * 0.5, canvas.clientHeight * 0.5);
  const picked = camera.pickEllipsoid(center, scene.globe.ellipsoid);
  if (Cesium.defined(picked)) {
    const cartographic = Cesium.Cartographic.fromCartesian(picked);
    return {
      latitude: Cesium.Math.toDegrees(cartographic.latitude),
      longitude: Cesium.Math.toDegrees(cartographic.longitude),
    };
  }

  const cameraCartographic = camera.positionCartographic;
  return {
    latitude: Cesium.Math.toDegrees(cameraCartographic.latitude),
    longitude: Cesium.Math.toDegrees(cameraCartographic.longitude),
  };
}

async function loadAircraft() {
  const layer = state.layers.get('aircraft');
  clearLayer('aircraft');
  const query = getAircraftQueryPoint();
  const snapshot = await fetchAircraftSnapshot(query.latitude, query.longitude, 250);
  const updated = snapshot.observedAt;
  window.__gevAircraftProvider = snapshot.provider;
  window.__gevAircraftSnapshot = snapshot;

  for (const aircraft of snapshot.aircraft) {
    const aLon = aircraft.position.longitude;
    const aLat = aircraft.position.latitude;
    const altitude = aircraft.position.altitudeBarometricM ?? aircraft.position.altitudeGeometricM ?? 500;
    if (!Number.isFinite(aLon) || !Number.isFinite(aLat)) continue;
    const callsign = aircraft.identity.callsign || aircraft.identity.icaoHex || 'AIR';
    const entity = addPoint(layer, aLon, aLat, altitude, callsign, Cesium.Color.CYAN, 6, {
      type: 'AIRCRAFT', name: callsign, id: aircraft.identity.icaoHex || callsign,
      source: snapshot.provider, updated, altitude,
      hex: aircraft.identity.icaoHex || 'UNKNOWN',
      callsign, registration: aircraft.identity.registration || '—',
      category: aircraft.identity.category || '—',
      aircraft,
      identity: aircraft.identity,
      position: aircraft.position,
      motion: aircraft.motion,
      navigation: aircraft.navigation,
      signal: aircraft.signal,
      integrity: aircraft.integrity,
      flags: aircraft.flags,
      transponder: aircraft.transponder,
      environment: aircraft.environment,
    });
    attachAircraftMotion(entity);
  }

  return snapshot.aircraft.length;
}

async function loadSatellites() {
  const layer = state.layers.get('satellites');
  clearLayer('satellites');

  let text = '';
  let cacheAge = 0;
  try {
    const cached = JSON.parse(localStorage.getItem(SATELLITE_CACHE_KEY) || 'null');
    if (cached?.text && Number.isFinite(Number(cached.timestamp))) {
      cacheAge = Date.now() - Number(cached.timestamp);
      if (cacheAge < SATELLITE_CACHE_TTL_MS) text = cached.text;
    }
  } catch {
    // Ignore malformed browser cache and use the live request below.
  }

  if (!text) {
    const response = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle', {
      mode: 'cors',
      headers: { Accept: 'text/plain' },
    });
    if (!response.ok) throw new Error(`CELESTRAK ${response.status} ${response.statusText}`);
    text = await response.text();
    try {
      localStorage.setItem(SATELLITE_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), text }));
    } catch {
      // Storage is optional; the current page can still use the live payload.
    }
    cacheAge = 0;
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const now = new Date();
  const updated = new Date().toISOString();
  let count = 0;

  for (let i = 0; i + 2 < lines.length && count < MAX_SATELLITES; i += 3) {
    if (!lines[i + 1]?.startsWith('1 ') || !lines[i + 2]?.startsWith('2 ')) continue;
    try {
      const satrec = satellite.twoline2satrec(lines[i + 1], lines[i + 2]);
      const position = satellite.propagate(satrec, now);
      const eci = position?.position;
      if (!eci) continue;
      const gmst = satellite.gstime(now);
      const geo = satellite.eciToGeodetic(eci, gmst);
      const lon = satellite.degreesLong(geo.longitude);
      const lat = satellite.degreesLat(geo.latitude);
      const height = geo.height * 1000;
      const name = lines[i] || `SAT-${count + 1}`;
      addPoint(layer, lon, lat, height, name, Cesium.Color.LIME, 5, {
        type: 'SATELLITE', name, id: name, source: 'CELESTRAK', updated,
        altitude: height, tleLine1: lines[i + 1], tleLine2: lines[i + 2],
      });
      count += 1;
    } catch {
      // Skip malformed TLEs without breaking the complete layer.
    }
  }

  syncSatellitePoints(layer);
  return count;
}

function clearSelectedTarget() {
  state.selectedEntity = null;
  state.selectedLayerId = null;
  $('targetPanel')?.setAttribute('hidden', '');
}

function selectTarget(entity, layerId) {
  state.selectedEntity = entity;
  state.selectedLayerId = layerId;
  const meta = entity?.gevMeta || {};
  $('targetType').textContent = meta.type || 'UNKNOWN';
  $('targetName').textContent = meta.name || 'UNKNOWN TARGET';
  $('targetId').textContent = meta.id || '—';
  $('targetPosition').textContent = '—';
  $('targetAltitude').textContent = Number.isFinite(meta.altitude) ? `${Math.round(meta.altitude)} M` : '—';
  $('targetSource').textContent = meta.source || '—';
  $('targetUpdated').textContent = meta.updated || '—';
  $('targetPanel')?.removeAttribute('hidden');
  window.__gevSelectedTarget = { entity, layerId, meta };
}

function refreshLayer(id, loader) {
  const layer = state.layers.get(id);
  if (!layer) return;
  setLayerEnabled(id, true);
  loader().then((count) => {
    setStatus(`${state.layers.get(id).name}: ${count} objects`, 'ok');
  }).catch((error) => {
    console.warn(`[GEV] ${id} layer failed`, error);
    setStatus(`${state.layers.get(id).name}: unavailable from this browser`, 'warn');
  });
}

function addLayerControls() {
  const definitions = [
    ['earthquakes', 'EARTHQUAKES', Cesium.Color.YELLOW, loadEarthquakes, REFRESH_MS],
    ['aircraft', 'AIRCRAFT', Cesium.Color.CYAN, loadAircraft, REFRESH_MS],
    ['satellites', 'SATELLITES', Cesium.Color.LIME, loadSatellites, SATELLITE_REFRESH_MS],
  ];
  for (const [id, name, color, loader, refresh] of definitions) {
    addLayer(id, name, color);
    document.querySelector(`[data-layer="${id}"]`)?.addEventListener('click', () => {
      const layer = state.layers.get(id);
      if (layer.enabled) {
        setLayerEnabled(id, false);
        clearLayer(id);
        return;
      }
      refreshLayer(id, loader);
      if (!state.timers.has(id)) {
        state.timers.set(id, window.setInterval(() => {
          if (state.layers.get(id)?.enabled) refreshLayer(id, loader);
        }, refresh));
      }
    });
  }
}

async function init() {
  // Remaining initialization is unchanged.
}

window.__gevWebCore = { state, setStatus, selectTarget };

// The full application initialization follows in the repository version.
