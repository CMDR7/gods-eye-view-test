import * as Cesium from 'cesium';
import * as satellite from 'satellite.js';
import { createOsmImagery } from '../maps/imagery.js';
import { applyStoredIonToken, clearIonToken, getIonTokenStatus, saveIonToken } from './ionToken.js';
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

async function loadAircraft() {
  const layer = state.layers.get('aircraft');
  clearLayer('aircraft');
  const camera = state.viewer.camera.positionCartographic;
  const lat = Cesium.Math.toDegrees(camera.latitude);
  const lon = Cesium.Math.toDegrees(camera.longitude);
  const data = await fetchJson(`https://api.adsb.lol/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/250`);
  const updated = new Date().toISOString();
  for (const ac of data.ac ?? []) {
    const aLon = Number(ac.lon);
    const aLat = Number(ac.lat);
    if (!Number.isFinite(aLon) || !Number.isFinite(aLat)) continue;
    const altitude = Number(ac.alt_baro);
    const callsign = ac.flight?.trim() || ac.hex || 'AIR';
    addPoint(layer, aLon, aLat, Number.isFinite(altitude) ? altitude * 0.3048 : 500, callsign, Cesium.Color.CYAN, 6, {
      type: 'AIRCRAFT', name: callsign, id: ac.hex || callsign, source: 'ADSB.LOL', updated,
      altitude: Number.isFinite(altitude) ? altitude * 0.3048 : 500, callsign, hex: ac.hex || 'UNKNOWN',
      squawk: ac.squawk || '—', registration: ac.r || ac.reg || '—', category: ac.category || '—',
    });
  }
  return data.ac?.length ?? 0;
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
    if (!response.ok) {
      throw new Error(`CELESTRAK ${response.status} ${response.statusText}`);
    }
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
      if (!position?.position || typeof position.position === 'boolean') continue;
      const gmst = satellite.gstime(now);
      const geo = satellite.eciToGeodetic(position.position, gmst);
      const name = lines[i] || 'UNKNOWN SATELLITE';
      const norad = lines[i + 1].slice(2, 7).trim();
      const inclination = Number.isFinite(Number(satrec.inclo)) ? satrec.inclo * 180 / Math.PI : Number.NaN;
      const period = Number.isFinite(Number(satrec.no)) && satrec.no > 0 ? (2 * Math.PI / satrec.no) / 60 : Number.NaN;
      addPoint(layer, satellite.degreesLong(geo.longitude), satellite.degreesLat(geo.latitude), geo.height * 1000, name, Cesium.Color.LIME, 7, {
        type: 'SATELLITE', name, id: norad || name, source: 'CELESTRAK // VISUAL', updated,
        altitude: geo.height * 1000, norad, inclination, period,
      });
      count++;
    } catch (error) {
      console.warn('[GEV] Satellite propagation skipped', error);
    }
  }

  if (!count) throw new Error('NO VALID SATELLITE POSITIONS');
  const cacheLabel = cacheAge > 0 ? ` // CACHE ${Math.round(cacheAge / 60000)}M` : ' // LIVE';
  setStatus(`SATELLITES: ${count} objects${cacheLabel}`, 'ok');
  return count;
}

async function refreshLayer(id, loader) {
  if (!state.layers.get(id)?.enabled) return;
  try {
    const count = await loader();
    setStatus(`${state.layers.get(id).name}: ${count} objects`, 'ok');
  } catch (error) {
    console.warn(`[GEV] ${id} unavailable`, error);
    setStatus(`${state.layers.get(id).name}: unavailable from this browser`, 'warn');
  }
}

function schedule(id, loader, interval) {
  const previous = state.timers.get(id);
  if (previous) clearInterval(previous);
  const timer = setInterval(() => refreshLayer(id, loader), interval);
  state.timers.set(id, timer);
  refreshLayer(id, loader);
}

function focusHome() {
  state.viewer.camera.flyHome(1.2);
}

function formatNumber(value, digits = 1) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';
}

function formatCoordinate(value, positive, negative) {
  if (!Number.isFinite(Number(value))) return '—';
  const numeric = Number(value);
  return `${Math.abs(numeric).toFixed(4)}° ${numeric >= 0 ? positive : negative}`;
}

function formatUpdated(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour12: false }) + ' UTC';
}

function setTargetField(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? '—';
}

function restoreSelectedVisual(entity) {
  if (!entity?.point || !entity.gevVisual) return;
  entity.point.color = entity.gevVisual.color;
  entity.point.pixelSize = entity.gevVisual.pixelSize;
  entity.point.outlineColor = Cesium.Color.BLACK;
  entity.point.outlineWidth = 1;
}

function applySelectedVisual(entity) {
  if (!entity?.point) return;
  entity.point.color = Cesium.Color.WHITE;
  entity.point.pixelSize = Math.max(Number(entity.gevVisual?.pixelSize || 6) + 4, 10);
  entity.point.outlineColor = Cesium.Color.CYAN;
  entity.point.outlineWidth = 2;
}

function updateTargetPanel(entity) {
  const meta = entity?.gevMeta || {};
  const position = entity?.position?.getValue(Cesium.JulianDate.now());
  const cartographic = position ? Cesium.Cartographic.fromCartesian(position) : undefined;
  const lon = cartographic ? Cesium.Math.toDegrees(cartographic.longitude) : Number.NaN;
  const lat = cartographic ? Cesium.Math.toDegrees(cartographic.latitude) : Number.NaN;
  const altitude = Number.isFinite(Number(meta.altitude)) ? Number(meta.altitude) : cartographic?.height;
  setTargetField('targetType', meta.type || 'UNKNOWN');
  setTargetField('targetName', meta.name || 'UNKNOWN');
  setTargetField('targetId', meta.id || entity?.id || '—');
  setTargetField('targetPosition', `${formatCoordinate(lat, 'N', 'S')} / ${formatCoordinate(lon, 'E', 'W')}`);
  setTargetField('targetAltitude', `${formatNumber(altitude, 0)} M`);
  setTargetField('targetSource', meta.source || '—');
  setTargetField('targetUpdated', formatUpdated(meta.updated));

  const detail = $('targetDetail');
  if (meta.type === 'AIRCRAFT') {
    detail.hidden = false;
    setTargetField('targetDetailLabel', 'CALLSIGN');
    setTargetField('targetDetailValue', meta.callsign || meta.name || '—');
  } else if (meta.type === 'SATELLITE') {
    detail.hidden = false;
    setTargetField('targetDetailLabel', 'NORAD');
    setTargetField('targetDetailValue', meta.norad || meta.id || '—');
  } else if (meta.type === 'EARTHQUAKE') {
    detail.hidden = false;
    setTargetField('targetDetailLabel', 'MAG / DEPTH');
    setTargetField('targetDetailValue', `M${formatNumber(meta.magnitude, 1)} / ${formatNumber(meta.depth, 1)} KM`);
  } else {
    detail.hidden = true;
  }
  $('targetPanel').hidden = false;
  $('targetTrack').textContent = state.viewer.trackedEntity === entity ? 'UNTRACK' : 'TRACK';
}

function clearSelectedTarget() {
  const previous = state.selectedEntity;
  if (previous) restoreSelectedVisual(previous);
  if (state.viewer?.trackedEntity === previous) state.viewer.trackedEntity = undefined;
  state.selectedEntity = null;
  state.selectedLayerId = null;
  if ($('targetPanel')) $('targetPanel').hidden = true;
  state.viewer?.scene.requestRender();
}

function selectTarget(entity) {
  if (!entity?.gevMeta) return;
  if (state.selectedEntity === entity) {
    updateTargetPanel(entity);
    return;
  }
  if (state.selectedEntity) restoreSelectedVisual(state.selectedEntity);
  if (state.viewer.trackedEntity) state.viewer.trackedEntity = undefined;
  state.selectedEntity = entity;
  state.selectedLayerId = entity.gevMeta.layerId || null;
  applySelectedVisual(entity);
  state.viewer.selectedEntity = undefined;
  updateTargetPanel(entity);
  setStatus(`TARGET SELECTED // ${entity.gevMeta.type}`, 'ok');
  state.viewer.scene.requestRender();
}

function pickEntity(windowPosition, directTarget) {
  if (directTarget?.gevMeta) return directTarget;
  const picked = state.viewer.scene.pick(windowPosition);
  if (!Cesium.defined(picked)) return undefined;
  const id = Cesium.defaultValue(picked.id, picked.primitive?.id);
  return id instanceof Cesium.Entity && id.gevMeta ? id : undefined;
}

function addTargetInteraction() {
  state.viewer.screenSpaceEventHandler.setInputAction((movement) => {
    const entity = pickEntity(movement.position, movement.__gevTarget);
    if (entity) selectTarget(entity);
    else clearSelectedTarget();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  state.viewer.screenSpaceEventHandler.setInputAction((movement) => {
    const entity = pickEntity(movement.endPosition);
    state.viewer.canvas.style.cursor = entity ? 'pointer' : '';
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

async function flyToSelectedTarget() {
  const entity = state.selectedEntity;
  if (!entity) return;
  state.viewer.trackedEntity = undefined;
  setStatus('NAVIGATING TO TARGET…');
  const completed = await state.viewer.flyTo(entity, {
    duration: 1.0,
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-35), 0),
  });
  if (completed) setStatus(`TARGET LOCKED // ${entity.gevMeta?.type || 'GEV'}`, 'ok');
}

function toggleTargetTracking() {
  const entity = state.selectedEntity;
  if (!entity) return;
  if (state.viewer.trackedEntity === entity) {
    state.viewer.trackedEntity = undefined;
    $('targetTrack').textContent = 'TRACK';
    setStatus('TARGET TRACKING OFF');
    return;
  }
  state.viewer.trackedEntity = entity;
  $('targetTrack').textContent = 'UNTRACK';
  setStatus(`TRACKING // ${entity.gevMeta?.type || 'GEV'}`, 'ok');
}

function copyTargetCoordinates() {
  const value = $('targetPosition')?.textContent || '';
  if (!value || value === '—') return;
  navigator.clipboard?.writeText(value).then(() => setStatus('TARGET COORDINATES COPIED', 'ok')).catch(() => setStatus('CLIPBOARD UNAVAILABLE', 'warn'));
}

function toggleCommandPanel(force) {
  const panel = $('commandPanel');
  const backdrop = $('commandBackdrop');
  const menu = $('menuToggle');
  if (!panel) return;

  const open = typeof force === 'boolean' ? force : !state.commandPanelOpen;
  state.commandPanelOpen = open;

  if (open) {
    panel.hidden = false;
    if (backdrop) backdrop.hidden = false;
    requestAnimationFrame(() => {
      panel.classList.add('open');
      backdrop?.classList.add('open');
    });
  } else {
    panel.classList.remove('open');
    backdrop?.classList.remove('open');
    window.setTimeout(() => {
      if (!state.commandPanelOpen) {
        panel.hidden = true;
        if (backdrop) backdrop.hidden = true;
      }
    }, DRAWER_TRANSITION_MS);
  }

  panel.setAttribute('aria-hidden', String(!open));
  menu?.setAttribute('aria-expanded', String(open));
}

function addCoordinateNavigation() {
  const parse = () => {
    const lat = Number.parseFloat($('coordinateLat').value);
    const lon = Number.parseFloat($('coordinateLon').value);
    const altRaw = $('coordinateAlt').value.trim();
    const altitude = altRaw === '' ? DEFAULT_NAV_ALTITUDE : Number.parseFloat(altRaw);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: 'LATITUDE MUST BE BETWEEN -90 AND 90' };
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) return { error: 'LONGITUDE MUST BE BETWEEN -180 AND 180' };
    if (!Number.isFinite(altitude) || altitude < 0) return { error: 'ALTITUDE MUST BE ZERO OR GREATER' };
    return { lat, lon, altitude };
  };
  const fly = () => {
    const result = parse();
    if (result.error) {
      setStatus(`NAVIGATION INPUT ERROR // ${result.error}`, 'warn');
      return;
    }
    state.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(result.lon, result.lat, result.altitude),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-35), roll: 0 },
      duration: 1.5,
    });
    setStatus(`NAVIGATION LOCK // ${result.lat.toFixed(5)} ${result.lon.toFixed(5)}`, 'ok');
  };
  $('coordinateFly')?.addEventListener('click', fly);
  $('coordinateAlt')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') fly(); });
  $('coordinateLat')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') fly(); });
  $('coordinateLon')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') fly(); });
  $('coordinateMyLocation')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      setStatus('LOCATION API UNAVAILABLE', 'warn');
      return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
      $('coordinateLat').value = position.coords.latitude.toFixed(6);
      $('coordinateLon').value = position.coords.longitude.toFixed(6);
      setStatus('CURRENT LOCATION ACQUIRED', 'ok');
    }, () => setStatus('CURRENT LOCATION UNAVAILABLE', 'warn'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
  $('coordinateCopy')?.addEventListener('click', () => {
    const value = `${$('coordinateLat').value}, ${$('coordinateLon').value}`;
    navigator.clipboard?.writeText(value).then(() => setStatus('COORDINATES COPIED', 'ok')).catch(() => setStatus('CLIPBOARD UNAVAILABLE', 'warn'));
  });
}

function addLayerControls() {
  const definitions = [
    ['earthquakes', 'EARTHQUAKES', Cesium.Color.YELLOW, loadEarthquakes, REFRESH_MS],
    ['aircraft', 'AIRCRAFT', Cesium.Color.CYAN, loadAircraft, REFRESH_MS],
    ['satellites', 'SATELLITES', Cesium.Color.LIME, loadSatellites, SATELLITE_REFRESH_MS],
  ];
  for (const [id, name, color, loader, interval] of definitions) {
    addLayer(id, name, color);
    document.querySelector(`[data-layer="${id}"]`)?.addEventListener('click', () => {
      const layer = state.layers.get(id);
      const enabled = !layer.enabled;
      setLayerEnabled(id, enabled);
      if (enabled) schedule(id, loader, interval);
      else clearLayer(id);
    });
  }
}

async function initialize() {
  const viewer = new Cesium.Viewer('globe', {
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    selectionIndicator: false,
    infoBox: false,
    baseLayerPicker: false,
    terrainProvider: undefined,
  });
  state.viewer = viewer;
  viewer.scene.globe.depthTestAgainstTerrain = false;
  viewer.scene.requestRenderMode = false;
  viewer.imageryLayers.addImageryProvider(createOsmImagery());
  viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(10, 50, 3_500_000), orientation: { heading: 0, pitch: Cesium.Math.toRadians(-60), roll: 0 } });

  addLayerControls();
  addTargetInteraction();
  addCoordinateNavigation();
  $('targetFly')?.addEventListener('click', flyToSelectedTarget);
  $('targetTrack')?.addEventListener('click', toggleTargetTracking);
  $('targetClear')?.addEventListener('click', clearSelectedTarget);
  $('targetCopy')?.addEventListener('click', copyTargetCoordinates);
  $('menuToggle')?.addEventListener('click', () => toggleCommandPanel());
  $('commandClose')?.addEventListener('click', () => toggleCommandPanel(false));
  $('commandBackdrop')?.addEventListener('click', () => toggleCommandPanel(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') toggleCommandPanel(false);
  });
  document.addEventListener('click', (event) => {
    const panel = $('commandPanel');
    if (state.commandPanelOpen && panel && !panel.contains(event.target) && event.target !== $('menuToggle')) toggleCommandPanel(false);
  });

  try {
    const ionStatus = getIonTokenStatus();
    if (ionStatus.configured) {
      const terrainPromise = Cesium.createWorldTerrainAsync?.();
      if (terrainPromise) {
        const terrainProvider = await Promise.race([
          terrainPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('ION TERRAIN TIMEOUT')), ION_TERRAIN_TIMEOUT_MS)),
        ]);
        viewer.terrainProvider = terrainProvider;
        state.ionTerrainEnabled = true;
        setStatus('WORLD TERRAIN ONLINE // CESIUM ION', 'ok');
      }
    } else {
      setStatus('WEB CORE READY // ION TOKEN NOT CONFIGURED', 'warn');
    }
  } catch (error) {
    console.warn('[GEV] Ion terrain unavailable', error);
    setStatus('ION TERRAIN ERROR // 403 ACCESS DENIED', 'warn');
  }

  $('ionSave')?.addEventListener('click', () => {
    try {
      saveIonToken($('ionToken').value, $('ionPersist')?.checked !== false);
      setStatus('ION TOKEN SAVED // RELOADING TERRAIN', 'ok');
      location.reload();
    } catch (error) {
      setStatus(`ION TOKEN ERROR // ${error.message}`, 'warn');
    }
  });
  $('ionClear')?.addEventListener('click', () => {
    clearIonToken();
    setStatus('ION TOKEN CLEARED // RELOADING', 'ok');
    location.reload();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}