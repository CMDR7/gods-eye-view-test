import * as Cesium from 'cesium';
import satellite from 'satellite.js';
import { createOsmImagery } from '../maps/imagery.js';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';

window.CESIUM_BASE_URL = './cesium/';

const REFRESH_MS = 60_000;
const SATELLITE_REFRESH_MS = 2 * 60 * 60 * 1000;
const MAX_SATELLITES = 1500;

const state = {
  viewer: null,
  layers: new Map(),
  timers: new Map(),
};

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
  if (layer) layer.dataSource.entities.removeAll();
}

function setLayerEnabled(id, enabled) {
  const layer = state.layers.get(id);
  if (!layer) return;
  layer.enabled = enabled;
  layer.dataSource.show = enabled;
  document.querySelector(`[data-layer="${id}"]`)?.classList.toggle('active', enabled);
}

function addPoint(layer, lon, lat, height, label, color, pixelSize = 7) {
  layer.dataSource.entities.add({
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
  for (const feature of feed.features ?? []) {
    const [lon, lat, depth = 0] = feature.geometry?.coordinates ?? [];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const mag = Number(feature.properties?.mag ?? 0);
    const color = mag >= 5 ? Cesium.Color.RED : mag >= 3 ? Cesium.Color.ORANGE : Cesium.Color.YELLOW;
    addPoint(layer, lon, lat, Math.max(0, -depth * 1000), `M${mag.toFixed(1)} ${feature.properties?.place ?? ''}`.trim(), color, Math.min(14, 4 + mag * 1.4));
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
  for (const ac of data.ac ?? []) {
    const aLon = Number(ac.lon);
    const aLat = Number(ac.lat);
    if (!Number.isFinite(aLon) || !Number.isFinite(aLat)) continue;
    const altitude = Number(ac.alt_baro);
    addPoint(layer, aLon, aLat, Number.isFinite(altitude) ? altitude * 0.3048 : 500, ac.flight?.trim() || ac.hex || 'AIR', Cesium.Color.CYAN, 6);
  }
  return data.ac?.length ?? 0;
}

async function loadSatellites() {
  const layer = state.layers.get('satellites');
  clearLayer('satellites');
  const text = await (await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle', { mode: 'cors' })).text();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const now = new Date();
  let count = 0;
  for (let i = 0; i + 2 < lines.length && count < MAX_SATELLITES; i += 3) {
    if (!lines[i + 1]?.startsWith('1 ') || !lines[i + 2]?.startsWith('2 ')) continue;
    const satrec = satellite.twoline2satrec(lines[i + 1], lines[i + 2]);
    const position = satellite.propagate(satrec, now);
    if (!position?.position || typeof position.position === 'boolean') continue;
    const gmst = satellite.gstime(now);
    const geo = satellite.eciToGeodetic(position.position, gmst);
    const lon = satellite.degreesLong(geo.longitude);
    const lat = satellite.degreesLat(geo.latitude);
    const height = geo.height * 1000;
    addPoint(layer, lon, lat, height, lines[i], Cesium.Color.LIME, 4);
    count++;
  }
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

function addControls() {
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

  addLayer('aircraft', 'AIRCRAFT', Cesium.Color.CYAN);
  addLayer('satellites', 'SATELLITES', Cesium.Color.LIME);
  addLayer('earthquakes', 'EARTHQUAKES', Cesium.Color.ORANGE);
  addControls();
  focusHome();
  setStatus('READY — NO BACKEND', 'ok');
}

boot().catch((error) => {
  console.error(error);
  setStatus(`BOOT FAILURE: ${error.message}`, 'error');
});
