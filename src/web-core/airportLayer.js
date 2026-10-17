import { loadMajorAirports } from './airportData.js';

const LAYER_ID = 'airports';
const BUTTON_ID = 'airportLayerButton';
const DATASET_LABEL = 'AIRPORTS // MAJOR';
const INSTALL_KEY = '__gevAirportLayerInstalled';

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

function setDetail(items) {
  const detail = document.getElementById('targetDetail');
  if (!detail) return;
  const slots = detail.querySelectorAll('.targetDetailItem');
  slots.forEach((slot, index) => {
    const item = items[index];
    slot.hidden = !item;
    if (!item) return;
    const label = slot.querySelector('[data-detail-label]');
    const value = slot.querySelector('[data-detail-value]');
    if (label) label.textContent = item.label;
    if (value) value.textContent = item.value ?? '—';
  });
  detail.hidden = items.length === 0;
}

function renderAirportTarget() {
  const panel = document.getElementById('targetPanel');
  if (!panel || panel.hidden) return;
  if (document.getElementById('targetType')?.textContent?.trim() !== 'AIRPORT') return;

  const id = document.getElementById('targetId')?.textContent?.trim() || '—';
  const entity = getScene()?.__gevWebCoreLayers?.get(LAYER_ID)?.dataSource?.entities?.values?.find((item) => String(item.gevMeta?.id) === id);
  const meta = entity?.gevMeta;
  if (!meta) return;

  setDetail([
    { label: 'ICAO / IDENT', value: meta.ident || meta.gpsCode || meta.id },
    { label: 'IATA', value: meta.iata || '—' },
    { label: 'CITY / MUNICIPALITY', value: meta.municipality || '—' },
    { label: 'COUNTRY', value: meta.isoCountry || '—' },
    { label: 'ELEVATION', value: `${formatNumber(meta.elevationFt, 0)} FT MSL` },
    { label: 'TYPE', value: 'LARGE AIRPORT' },
    { label: 'SOURCE', value: meta.source || 'OURAIRPORTS' },
  ]);
}

function installTargetDetails() {
  const panel = document.getElementById('targetPanel');
  if (!panel || panel.__gevAirportTargetObserver) return;
  panel.__gevAirportTargetObserver = true;
  const observer = new MutationObserver(() => {
    if (panel.hidden) return;
    window.setTimeout(renderAirportTarget, 0);
  });
  observer.observe(panel, { attributes: true, childList: true, subtree: true, characterData: true });
}

function createLayer(scene) {
  const layers = scene.__gevWebCoreLayers;
  if (!layers || layers.has(LAYER_ID)) return layers?.get(LAYER_ID) || null;

  const dataSource = new Cesium.CustomDataSource(LAYER_ID);
  scene.__gevScene?.viewer?.dataSources?.add?.(dataSource);
  const layer = {
    id: LAYER_ID,
    name: 'AIRPORTS',
    color: Cesium.Color.ORANGE,
    dataSource,
    enabled: false,
    loaded: false,
  };
  layers.set(LAYER_ID, layer);
  return layer;
}

async function populateLayer(scene, layer) {
  if (layer.loaded) {
    layer.dataSource.show = true;
    return layer.dataSource.entities.values.length;
  }

  setStatus('AIRPORTS: loading major-airport dataset…');
  const { airports, cached } = await loadMajorAirports();

  for (const airport of airports) {
    const code = airport.iata || airport.ident || airport.gpsCode || 'APT';
    const label = airport.iata ? `${airport.iata} // ${airport.name}` : `${airport.ident} // ${airport.name}`;
    const entity = layer.dataSource.entities.add({
      position: Cesium.Cartesian3.fromDegrees(airport.longitude, airport.latitude, Math.max(0, airport.elevationM || 0)),
      point: {
        pixelSize: 6,
        color: Cesium.Color.ORANGE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: label,
        font: '11px monospace',
        fillColor: Cesium.Color.ORANGE,
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.72),
        pixelOffset: new Cesium.Cartesian2(9, 0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: false,
      },
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
  }

  layer.loaded = true;
  layer.dataSource.show = true;
  scene.requestRender();
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
