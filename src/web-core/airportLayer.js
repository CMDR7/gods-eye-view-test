import * as Cesium from 'cesium';
import { loadMajorAirports } from './airportData.js';

const LAYER_ID = 'airports';
const BUTTON_ID = 'airportLayerButton';
const DATASET_LABEL = 'AIRPORTS // MAJOR';
const INSTALL_KEY = '__gevAirportLayerInstalled';
const POINT_COLLECTION_KEY = '__gevAirportPointCollection';
const AIRPORT_PICK_RADIUS_PX = 26;

function getScene() {
  return document.querySelector('#globe canvas')?.__gevScene || null;
}

function setStatus(message, type = 'info') {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

function formatNumber(value, digits = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';
}

function renderAirportTarget() {
  const panel = document.getElementById('targetPanel');
  if (!panel || panel.hidden) return;
  if (document.getElementById('targetType')?.textContent?.trim() !== 'AIRPORT') return;

  const id = document.getElementById('targetId')?.textContent?.trim() || '—';
  const entity = getScene()?.__gevWebCoreLayers?.get(LAYER_ID)?.dataSource?.entities?.values?.find((item) => String(item.gevMeta?.id) === id);
  const meta = entity?.gevMeta;
  if (!meta) return;

  const detail = document.getElementById('targetDetail');
  if (detail) detail.hidden = false;
  const label = document.getElementById('targetDetailLabel');
  const value = document.getElementById('targetDetailValue');
  if (label) label.textContent = 'IATA / CITY';
  if (value) value.textContent = `${meta.iata || meta.ident || meta.gpsCode || meta.id} / ${meta.municipality || meta.isoCountry || '—'}`;
}

function installTargetDetails() {
  const panel = document.getElementById('targetPanel');
  if (!panel || panel.__gevAirportTargetObserver) return;
  panel.__gevAirportTargetObserver = true;
  const observer = new MutationObserver(() => {
    if (!panel.hidden) window.setTimeout(renderAirportTarget, 0);
  });
  observer.observe(panel, { attributes: true, childList: true, subtree: true, characterData: true });
}

function getPointCollection(scene) {
  let collection = scene[POINT_COLLECTION_KEY];
  if (!collection) {
    collection = scene.primitives.add(new Cesium.PointPrimitiveCollection());
    collection.show = false;
    scene[POINT_COLLECTION_KEY] = collection;
  }
  return collection;
}

function resolveAirportTarget(scene, windowPosition) {
  const collection = scene?.[POINT_COLLECTION_KEY];
  if (!collection?.show || !Cesium.defined(windowPosition)) return undefined;

  const screen = new Cesium.Cartesian2();
  let best;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < collection.length; index += 1) {
    const point = collection.get(index);
    if (!point?.show || !point.id?.gevMeta) continue;

    let projected;
    try {
      projected = point.computeScreenSpacePosition(scene, screen);
    } catch {
      continue;
    }
    if (!projected) continue;

    const distance = Cesium.Cartesian2.distance(projected, windowPosition);
    const hitRadius = Math.max(AIRPORT_PICK_RADIUS_PX, Number(point.pixelSize || 6) * 0.5 + 12);
    if (distance <= hitRadius && distance < bestDistance) {
      best = point.id;
      bestDistance = distance;
    }
  }

  return best;
}

function installPickResolver(scene) {
  scene.__gevResolveAirportTarget = (windowPosition) => resolveAirportTarget(scene, windowPosition);
}

function getHudProfile() {
  const hud = document.documentElement.dataset.gevHud || 'tactical';
  if (hud === 'operator') return { size: 6.96, alpha: 1 };
  if (hud === 'minimal') return { size: 4.92, alpha: 0.86 };
  if (hud === 'cyber') return { size: 6.3, alpha: 0.96 };
  return { size: 6, alpha: 1 };
}

function syncPointVisuals(scene, layer) {
  const collection = scene[POINT_COLLECTION_KEY];
  if (!collection) return;
  const profile = getHudProfile();
  const occluder = scene.__gevAirportOccluder || (scene.__gevAirportOccluder = new Cesium.EllipsoidalOccluder(scene.globe.ellipsoid));
  occluder.cameraPosition = scene.camera.positionWC;

  for (const entity of layer.dataSource.entities.values) {
    const point = entity.__gevAirportPoint;
    if (!point) continue;
    const selected = document.getElementById('targetPanel')?.hidden === false && document.getElementById('targetId')?.textContent?.trim() === String(entity.gevMeta?.id);
    const horizonVisible = occluder.isPointVisible(point.position);
    point.show = layer.enabled && horizonVisible;
    point.pixelSize = selected ? Math.max(profile.size + 4, 10) : profile.size;
    point.color = selected ? Cesium.Color.WHITE : Cesium.Color.ORANGE.withAlpha(profile.alpha);
    point.outlineColor = selected ? Cesium.Color.CYAN : Cesium.Color.BLACK;
    point.outlineWidth = selected ? 2 : 1;
  }
  collection.show = layer.enabled;
  scene.requestRender();
}

function installHudSync(scene, layer) {
  const hudObserver = new MutationObserver(() => syncPointVisuals(scene, layer));
  hudObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-gev-hud'] });
  const panel = document.getElementById('targetPanel');
  if (panel) hudObserver.observe(panel, { attributes: true, childList: true, subtree: true, characterData: true });
  scene.camera.changed.addEventListener(() => syncPointVisuals(scene, layer));
}

function createLayer(scene) {
  const layers = scene.__gevWebCoreLayers;
  if (!layers) return null;
  if (layers.has(LAYER_ID)) return layers.get(LAYER_ID);

  const dataSource = new Cesium.CustomDataSource(LAYER_ID);
  const layer = {
    id: LAYER_ID,
    name: 'AIRPORTS',
    color: Cesium.Color.ORANGE,
    dataSource,
    enabled: false,
    loaded: false,
  };
  layers.set(LAYER_ID, layer);
  installHudSync(scene, layer);
  installPickResolver(scene);
  return layer;
}

async function populateLayer(scene, layer) {
  if (layer.loaded) {
    layer.dataSource.show = true;
    syncPointVisuals(scene, layer);
    return layer.dataSource.entities.values.length;
  }

  setStatus('AIRPORTS: loading major-airport dataset…');
  const { airports, cached } = await loadMajorAirports();
  const collection = getPointCollection(scene);

  for (const airport of airports) {
    const code = airport.iata || airport.ident || airport.gpsCode || 'APT';
    const label = airport.iata ? `${airport.iata} // ${airport.name}` : `${airport.ident} // ${airport.name}`;
    const entity = new Cesium.Entity({
      position: Cesium.Cartesian3.fromDegrees(airport.longitude, airport.latitude, Math.max(0, airport.elevationM || 0)),
    });
    entity.gevMeta = {
      layerId: LAYER_ID,
      type: 'AIRPORT',
      name: airport.name,
      id: airport.ident || code,
      source: airport.source,
      updated: new Date().toISOString(),
      altitude: airport.elevationM || 0,
      ident: airport.ident,
      iata: airport.iata,
      gpsCode: airport.gpsCode,
      localCode: airport.localCode,
      isoCountry: airport.isoCountry,
      isoRegion: airport.isoRegion,
      municipality: airport.municipality,
      elevationFt: airport.elevationFt,
      typeCode: airport.type,
    };
    entity.gevVisual = { color: Cesium.Color.ORANGE, pixelSize: 6 };
    entity.point = { color: Cesium.Color.ORANGE, pixelSize: 6 };
    entity.label = { text: label, show: false, font: '11px monospace' };
    layer.dataSource.entities.add(entity);

    const point = collection.add({
      position: entity.position.getValue(Cesium.JulianDate.now()),
      pixelSize: 6,
      color: Cesium.Color.ORANGE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 1,
      // Keep airports depth-tested at globe scale so back-side airports do not
      // bleed through the planet. The explicit screen-space picker remains
      // available for the rendered points on the visible hemisphere.
      disableDepthTestDistance: 5_000,
      id: entity,
    });
    entity.__gevAirportPoint = point;
  }

  layer.loaded = true;
  layer.dataSource.show = true;
  syncPointVisuals(scene, layer);
  setStatus(`AIRPORTS: ${airports.length} major airports${cached ? ' // CACHE' : ' // LIVE DATA'}`, 'ok');
  return airports.length;
}

function installButton() {
  const controls = document.getElementById('controls');
  if (!controls || document.getElementById(BUTTON_ID)) return;
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.dataset.layer = LAYER_ID;
  button.textContent = DATASET_LABEL;
  controls.insertBefore(button, controls.querySelector('#visualSettings') || null);

  button.addEventListener('click', async () => {
    const scene = getScene();
    const layer = scene ? createLayer(scene) : null;
    if (!scene || !layer) {
      setStatus('AIRPORTS ERROR // SCENE NOT READY', 'warn');
      return;
    }

    layer.enabled = !layer.enabled;
    layer.dataSource.show = layer.enabled;
    button.classList.toggle('active', layer.enabled);
    if (!layer.enabled) {
      const collection = scene[POINT_COLLECTION_KEY];
      if (collection) collection.show = false;
      setStatus('AIRPORTS: OFF');
      scene.requestRender();
      return;
    }

    try {
      await populateLayer(scene, layer);
    } catch (error) {
      console.warn('[GEV] Airport dataset unavailable', error);
      layer.enabled = false;
      layer.dataSource.show = false;
      button.classList.remove('active');
      setStatus('AIRPORTS: unavailable from this browser', 'warn');
    }
  });
}

function install(attempt = 0) {
  if (window[INSTALL_KEY]) return;
  const scene = getScene();
  if (!scene?.__gevWebCoreLayers) {
    if (attempt < 600) requestAnimationFrame(() => install(attempt + 1));
    return;
  }

  window[INSTALL_KEY] = true;
  createLayer(scene);
  installButton();
  installTargetDetails();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => install(), { once: true });
} else {
  install();
}

console.info('[GEV] Major airport layer ready // OurAirports');
