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

function pickEntity(windowPosition) {
  const picked = state.viewer.scene.pick(windowPosition);
  if (!Cesium.defined(picked)) return undefined;
  const id = Cesium.defaultValue(picked.id, picked.primitive?.id);
  return id instanceof Cesium.Entity && id.gevMeta ? id : undefined;
}

function addTargetInteraction() {
  state.viewer.screenSpaceEventHandler.setInputAction((movement) => {
    const entity = pickEntity(movement.position);
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
  if (completed && state.selectedEntity === entity) {
    state.viewer.scene.requestRender();
    setStatus(`TARGET LOCKED // ${entity.gevMeta?.name || entity.id}`, 'ok');
  }
}

function toggleTargetTracking() {
  const entity = state.selectedEntity;
  if (!entity) return;
  if (state.viewer.trackedEntity === entity) {
    state.viewer.trackedEntity = undefined;
    $('targetTrack').textContent = 'TRACK';
    setStatus('TARGET TRACKING DISABLED', 'ok');
  } else {
    state.viewer.trackedEntity = entity;
    $('targetTrack').textContent = 'UNTRACK';
    setStatus(`TRACKING TARGET // ${entity.gevMeta?.name || entity.id}`, 'ok');
  }
  state.viewer.scene.requestRender();
}

function addTargetControls() {
  $('targetClose').addEventListener('click', clearSelectedTarget);
  $('targetClear').addEventListener('click', clearSelectedTarget);
  $('targetFly').addEventListener('click', () => flyToSelectedTarget());
  $('targetTrack').addEventListener('click', toggleTargetTracking);
}

function parseCoordinateInput() {
  const lat = Number.parseFloat($('coordinateLat').value);
  const lon = Number.parseFloat($('coordinateLon').value);
  const altRaw = $('coordinateAlt').value.trim();
  const altitude = altRaw === '' ? DEFAULT_NAV_ALTITUDE : Number.parseFloat(altRaw);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: 'LATITUDE MUST BE BETWEEN -90 AND 90' };
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return { error: 'LONGITUDE MUST BE BETWEEN -180 AND 180' };
  if (!Number.isFinite(altitude) || altitude < 0) return { error: 'ALTITUDE MUST BE ZERO OR GREATER' };
  return { lat, lon, altitude };
}

function setCoordinateState(message, type = 'info') {
  const el = $('coordinateState');
  el.textContent = message;
  el.dataset.type = type;
}

function openCoordinatePanel() {
  closeCommandPanel();
  const panel = $('coordinatePanel');
  panel.hidden = false;
  setCoordinateState('READY // DECIMAL COORDINATES');
  window.setTimeout(() => $('coordinateLat').focus(), 0);
}

function closeCoordinatePanel() {
  $('coordinatePanel').hidden = true;
}

function flyToCoordinates() {
  const result = parseCoordinateInput();
  if (result.error) {
    setCoordinateState(result.error, 'warn');
    setStatus(`NAVIGATION INPUT ERROR // ${result.error}`, 'warn');
    return;
  }
  const { lat, lon, altitude } = result;
  setCoordinateState(`LOCKED // ${lat.toFixed(5)}, ${lon.toFixed(5)}`, 'ok');
  setStatus('NAVIGATING TO COORDINATES…');
  state.viewer.trackedEntity = undefined;
  state.viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitude),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-35), roll: 0 },
    duration: 1.5,
    complete: () => {
      setStatus(`COORDINATE LOCKED // ${lat.toFixed(4)}, ${lon.toFixed(4)}`, 'ok');
      state.viewer.scene.requestRender();
    },
    cancel: () => setStatus('COORDINATE FLIGHT CANCELLED', 'warn'),
  });
}

function useCurrentLocationForCoordinates() {
  if (!navigator.geolocation) {
    setCoordinateState('GEOLOCATION UNAVAILABLE', 'warn');
    setStatus('Geolocation is not available', 'warn');
    return;
  }
  setCoordinateState('ACQUIRING POSITION…');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      $('coordinateLat').value = coords.latitude.toFixed(6);
      $('coordinateLon').value = coords.longitude.toFixed(6);
      setCoordinateState('CURRENT LOCATION LOADED', 'ok');
      setStatus('CURRENT LOCATION LOADED INTO NAVIGATION', 'ok');
    },
    () => {
      setCoordinateState('LOCATION PERMISSION DENIED', 'warn');
      setStatus('Location permission denied or unavailable', 'warn');
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
  );
}

async function copyCoordinateInput() {
  const result = parseCoordinateInput();
  if (result.error) {
    setCoordinateState(result.error, 'warn');
    return;
  }
  const text = `${result.lat.toFixed(6)}, ${result.lon.toFixed(6)}${$('coordinateAlt').value.trim() ? `, ${result.altitude.toFixed(0)} m` : ''}`;
  try {
    await navigator.clipboard.writeText(text);
    setCoordinateState('COPIED // ' + text, 'ok');
    setStatus('COORDINATES COPIED TO CLIPBOARD', 'ok');
  } catch {
    setCoordinateState('CLIPBOARD UNAVAILABLE', 'warn');
    setStatus('Clipboard access unavailable in this browser', 'warn');
  }
}

function addCoordinateControls() {
  $('coordinateNav').addEventListener('click', openCoordinatePanel);
  $('coordinateClose').addEventListener('click', closeCoordinatePanel);
  $('coordinateFly').addEventListener('click', flyToCoordinates);
  $('coordinateLocation').addEventListener('click', useCurrentLocationForCoordinates);
  $('coordinateCopy').addEventListener('click', copyCoordinateInput);
  ['coordinateLat', 'coordinateLon', 'coordinateAlt'].forEach((id) => {
    $(id).addEventListener('keydown', (event) => {
      if (event.key === 'Enter') flyToCoordinates();
    });
  });
}

function updateIonPanelState() {
  const status = getIonTokenStatus();
  const stateEl = $('ionState');
  const input = $('ionToken');
  const connect = $('ionConnect');
  const remember = $('ionRemember');
  const description = $('ionDescription');
  stateEl.textContent = status.configured
    ? status.persisted ? 'USER TOKEN CONFIGURED // DEVICE STORAGE' : 'USER TOKEN CONFIGURED // SESSION ONLY'
    : 'NO USER TOKEN CONFIGURED';
  stateEl.dataset.type = status.configured ? 'ok' : 'warn';
  input.placeholder = status.configured ? 'TOKEN STORED — ENTER NEW TOKEN TO REPLACE' : 'Paste Cesium Ion token';
  connect.textContent = status.configured ? 'REPLACE TOKEN' : 'CONNECT';
  connect.disabled = status.configured && !input.value.trim();
  remember.checked = status.persisted || !status.configured;
  description.textContent = status.configured
    ? 'A Cesium Ion token is active in this browser. It is not displayed here. Enter a new token only if you want to replace it.'
    : 'Enter your own Cesium Ion access token. The token is used directly by this browser and is never sent to a GEV server.';
}

function updateIonTerrainControl() {
  const button = $('ionTerrain');
  const configured = getIonTokenStatus().configured;
  button.disabled = !configured;
  button.classList.toggle('active', state.ionTerrainEnabled);
  button.textContent = state.ionTerrainEnabled ? 'ION TERRAIN // ON' : 'ION TERRAIN';
}

function classifyIonTerrainError(error) {
  const message = String(error?.message ?? error ?? '').toLowerCase();
  if (message.includes('401') || message.includes('unauthorized') || message.includes('invalid_token')) return 'ION TERRAIN ERROR // 401 AUTHORIZATION';
  if (message.includes('403') || message.includes('forbidden')) return 'ION TERRAIN ERROR // 403 ACCESS DENIED';
  if (message.includes('404') || message.includes('not found')) return 'ION TERRAIN ERROR // 404 ASSET NOT FOUND';
  if (message.includes('timeout')) return 'ION TERRAIN ERROR // REQUEST TIMEOUT';
  return 'ION TERRAIN ERROR // REQUEST FAILED';
}

async function setIonTerrain(enabled) {
  if (!state.viewer) return;
  if (enabled && !getIonTokenStatus().configured) {
    setStatus('CESIUM ION TOKEN REQUIRED FOR WORLD TERRAIN', 'warn');
    return;
  }
  const button = $('ionTerrain');
  button.disabled = true;
  setStatus(enabled ? 'LOADING CESIUM WORLD TERRAIN…' : 'RESTORING ELLIPSOID TERRAIN…');
  try {
    if (enabled) {
      const terrainProvider = await Promise.race([
        Cesium.createWorldTerrainAsync(),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error('timeout')), ION_TERRAIN_TIMEOUT_MS)),
      ]);
      state.viewer.scene.setTerrain(new Cesium.Terrain(terrainProvider));
      state.ionTerrainEnabled = true;
      setStatus('CESIUM WORLD TERRAIN ACTIVE', 'ok');
    } else {
      state.viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      state.ionTerrainEnabled = false;
      setStatus('ELLIPSOID TERRAIN ACTIVE', 'ok');
    }
  } catch (error) {
    console.warn('[GEV] Cesium World Terrain unavailable', error);
    state.ionTerrainEnabled = false;
    state.viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    setStatus(classifyIonTerrainError(error), 'warn');
  } finally {
    updateIonTerrainControl();
    state.viewer.scene.requestRender();
  }
}

function openCommandPanel() {
  const panel = $('commandPanel');
  const backdrop = $('commandBackdrop');
  const toggle = $('menuToggle');
  if (state.commandPanelOpen) return;
  state.commandPanelOpen = true;
  panel.hidden = false;
  backdrop.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-label', 'Close command panel');
  requestAnimationFrame(() => {
    panel.classList.add('open');
    backdrop.classList.add('open');
  });
}

function closeCommandPanel() {
  const panel = $('commandPanel');
  const backdrop = $('commandBackdrop');
  const toggle = $('menuToggle');
  if (!state.commandPanelOpen) return;
  state.commandPanelOpen = false;
  panel.classList.remove('open');
  backdrop.classList.remove('open');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Open command panel');
  window.setTimeout(() => {
    if (!state.commandPanelOpen) {
      panel.hidden = true;
      backdrop.hidden = true;
    }
  }, DRAWER_TRANSITION_MS);
}

function addCommandPanelControls() {
  $('menuToggle').addEventListener('click', () => {
    state.commandPanelOpen ? closeCommandPanel() : openCommandPanel();
  });
  $('commandClose').addEventListener('click', closeCommandPanel);
  $('commandBackdrop').addEventListener('click', closeCommandPanel);
}

function addIonControls() {
  const panel = $('ionPanel');
  const input = $('ionToken');
  const remember = $('ionRemember');
  $('ionSettings').addEventListener('click', () => {
    closeCommandPanel();
    panel.hidden = false;
    updateIonPanelState();
    updateIonTerrainControl();
    if (!getIonTokenStatus().configured) input.focus();
  });
  $('ionClose').addEventListener('click', () => { panel.hidden = true; });
  input.addEventListener('input', updateIonPanelState);
  $('ionConnect').addEventListener('click', () => {
    try {
      saveIonToken(input.value, remember.checked);
      input.value = '';
      updateIonPanelState();
      updateIonTerrainControl();
      setStatus('CESIUM ION TOKEN SAVED — RELOADING…', 'ok');
      window.setTimeout(() => window.location.reload(), 250);
    } catch (error) {
      updateIonPanelState();
      setStatus(error.message, 'warn');
    }
  });
  $('ionClear').addEventListener('click', () => {
    clearIonToken();
    input.value = '';
    state.ionTerrainEnabled = false;
    updateIonPanelState();
    updateIonTerrainControl();
    setStatus('CESIUM ION TOKEN CLEARED — RELOADING…', 'ok');
    window.setTimeout(() => window.location.reload(), 250);
  });
  $('ionTerrain').addEventListener('click', () => setIonTerrain(!state.ionTerrainEnabled));
  updateIonPanelState();
  updateIonTerrainControl();
}

function addControls() {
  addCommandPanelControls();
  document.querySelectorAll('[data-layer]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.layer;
      const enabled = !state.layers.get(id)?.enabled;
      setLayerEnabled(id, enabled);
      if (enabled) {
        const loader = id === 'earthquakes' ? loadEarthquakes : id === 'aircraft' ? loadAircraft : loadSatellites;
        const interval = id === 'satellites' ? SATELLITE_REFRESH_MS : REFRESH_MS;
        schedule(id, loader, interval);
      } else {
        clearLayer(id);
        const timer = state.timers.get(id);
        if (timer) clearInterval(timer);
        state.timers.delete(id);
      }
    });
  });
  $('home').addEventListener('click', focusHome);
  $('locate').addEventListener('click', () => {
    if (!navigator.geolocation) return setStatus('Geolocation is not available', 'warn');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => state.viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(coords.longitude, coords.latitude, 120000) }),
      () => setStatus('Location permission denied or unavailable', 'warn'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  });
  addCoordinateControls();
  addIonControls();
  addTargetControls();
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (state.commandPanelOpen) { closeCommandPanel(); return; }
    if (!$('coordinatePanel').hidden) { closeCoordinatePanel(); return; }
    if (!$('ionPanel').hidden) { $('ionPanel').hidden = true; return; }
    clearSelectedTarget();
  });
}

function addTelemetryHud() {
  const hud = document.createElement('section');
  hud.className = 'telemetryHud';
  hud.setAttribute('aria-label', 'Camera telemetry');
  const labels = ['LAT', 'LON', 'ALT', 'HDG', 'RNG'];
  labels.forEach((label) => {
    const item = document.createElement('div');
    item.className = 'telemetryReadout';
    const title = document.createElement('span');
    title.textContent = label;
    const value = document.createElement('strong');
    value.dataset.telemetry = label;
    value.textContent = '—';
    item.append(title, value);
    hud.appendChild(item);
  });
  document.body.appendChild(hud);

  const style = document.createElement('style');
  style.textContent = [
    '.telemetryHud {',
    '  position: fixed;',
    '  z-index: 20;',
    '  left: 50%;',
    '  bottom: calc(12px + env(safe-area-inset-bottom));',
    '  transform: translateX(-50%);',
    '  width: min(620px, calc(100vw - 24px));',
    '  display: grid;',
    '  grid-template-columns: repeat(5, minmax(0, 1fr));',
    '  gap: 5px;',
    '  padding: 5px;',
    '  border: 1px solid rgba(80, 210, 255, .2);',
    '  border-radius: 8px;',
    '  background: rgba(3, 9, 13, .64);',
    '  box-shadow: 0 8px 28px rgba(0, 0, 0, .35), inset 0 1px 0 rgba(130, 235, 255, .12);',
    '  backdrop-filter: blur(12px) saturate(120%);',
    '  -webkit-backdrop-filter: blur(12px) saturate(120%);',
    '  pointer-events: none;',
    '  user-select: none;',
    '}',
    '.telemetryReadout { min-width: 0; padding: 5px 6px 4px; border: 1px solid rgba(100, 220, 255, .09); border-radius: 5px; background: rgba(0, 0, 0, .22); box-shadow: inset 0 1px 0 rgba(120, 230, 255, .07); }',
    '.telemetryReadout span { display: block; margin-bottom: 3px; font: 600 7px/1 Orbitron, sans-serif; letter-spacing: .12em; color: #647b86; }',
    '.telemetryReadout strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 9px/1.1 Orbitron, sans-serif; letter-spacing: .02em; color: #dffaff; text-shadow: 0 0 8px rgba(90, 220, 255, .18); }',
    '@media (max-width: 520px) { .telemetryHud { bottom: calc(8px + env(safe-area-inset-bottom)); width: calc(100vw - 16px); gap: 3px; padding: 4px; } .telemetryReadout { padding: 4px 4px 3px; } .telemetryReadout span { font-size: 6px; } .telemetryReadout strong { font-size: 7px; } }',
  ].join('\n');
  document.head.appendChild(style);

  const fields = Object.fromEntries(labels.map((key) => [key, hud.querySelector(`[data-telemetry="${key}"]`)]));
  const formatTelemetry = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';
  const update = () => {
    const camera = state.viewer?.camera;
    const scene = state.viewer?.scene;
    if (!camera || !scene) return;
    const cartographic = camera.positionCartographic;
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    const heading = Cesium.Math.toDegrees(Cesium.Math.zeroToTwoPi(camera.heading));
    const altitude = cartographic.height;
    fields.LAT.textContent = Math.abs(lat).toFixed(4) + '° ' + (lat >= 0 ? 'N' : 'S');
    fields.LON.textContent = Math.abs(lon).toFixed(4) + '° ' + (lon >= 0 ? 'E' : 'W');
    fields.ALT.textContent = formatTelemetry(altitude, 0) + ' M';
    fields.HDG.textContent = formatTelemetry(heading, 0) + '°';
    let range = Number.NaN;
    try {
      const center = new Cesium.Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2);
      const ray = camera.getPickRay(center);
      const surface = ray ? scene.globe.pick(ray, scene) : undefined;
      if (surface) range = Cesium.Cartesian3.distance(camera.position, surface);
    } catch { range = Number.NaN; }
    fields.RNG.textContent = Number.isFinite(range) ? formatTelemetry(range / 1000, range >= 100000 ? 0 : 1) + ' KM' : '—';
  };
  let queued = false;
  const queueUpdate = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => { queued = false; update(); });
  };
  state.viewer.camera.changed.addEventListener(queueUpdate);
  state.viewer.camera.moveEnd.addEventListener(queueUpdate);
  state.viewer.scene.postRender.addEventListener(update);
  update();
}

async function boot() {
  setStatus('INITIALIZING GLOBE…');
  state.viewer = new Cesium.Viewer('cesiumContainer', {
    baseLayer: new Cesium.ImageryLayer(createOsmImagery()),
    baseLayerPicker: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    vrButton: false,
    selectionIndicator: false,
    infoBox: false,
    scene3DOnly: true,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    msaaSamples: 2,
  });
  state.viewer.scene.globe.show = true;
  state.viewer.scene.skyAtmosphere.show = true;
  state.viewer.scene.requestRender();
  addTelemetryHud();
  addLayer('aircraft', 'AIRCRAFT', Cesium.Color.CYAN);
  addLayer('satellites', 'SATELLITES', Cesium.Color.LIME);
  addLayer('earthquakes', 'EARTHQUAKES', Cesium.Color.ORANGE);
  addTargetInteraction();
  addControls();
  focusHome();
  const ionStatus = getIonTokenStatus();
  setStatus(ionStatus.configured ? 'READY — CESIUM ION USER TOKEN' : 'READY — NO BACKEND', 'ok');
}

boot().catch((error) => {
  console.error(error);
  setStatus(`BOOT FAILURE: ${error.message}`, 'error');
});
