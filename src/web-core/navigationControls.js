import * as Cesium from 'cesium';

const $ = (id) => document.getElementById(id);
const HOME_DURATION = 1.2;
const LOCATION_TIMEOUT = 12_000;

let visualModesLoad = null;

function getViewer() {
  return document.querySelector('#globe canvas')?.__gevScene?.viewer || window.__gevViewer || null;
}

function getScene() {
  return document.querySelector('#globe canvas')?.__gevScene || null;
}

function setStatus(message, type = 'info') {
  const el = $('status');
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

function setCoordinateStatus(message, type = 'info') {
  const el = $('coordinateState');
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

function flyHome() {
  const scene = getScene();
  if (!scene) {
    setStatus('NAVIGATION ERROR // SCENE NOT READY', 'warn');
    return;
  }
  scene.camera.flyHome(HOME_DURATION);
  setStatus('HOME VIEW // NAVIGATING', 'ok');
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    setStatus('LOCATION API UNAVAILABLE', 'warn');
    setCoordinateStatus('LOCATION API UNAVAILABLE', 'warn');
    return;
  }

  setStatus('LOCATING // REQUESTING DEVICE POSITION…');
  setCoordinateStatus('LOCATING // REQUESTING DEVICE POSITION…');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = Number(position.coords.latitude);
      const lon = Number(position.coords.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        setStatus('LOCATION ERROR // INVALID POSITION', 'warn');
        setCoordinateStatus('LOCATION ERROR // INVALID POSITION', 'warn');
        return;
      }

      const scene = getScene();
      if (scene) {
        scene.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(lon, lat, 15_000),
          orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-35),
            roll: 0,
          },
          duration: 1.5,
        });
      }

      const latInput = $('coordinateLat');
      const lonInput = $('coordinateLon');
      if (latInput) latInput.value = lat.toFixed(6);
      if (lonInput) lonInput.value = lon.toFixed(6);
      setStatus(`LOCATION LOCK // ${lat.toFixed(5)} ${lon.toFixed(5)}`, 'ok');
      setCoordinateStatus('CURRENT LOCATION ACQUIRED', 'ok');
    },
    (error) => {
      console.warn('[GEV] Device geolocation unavailable', error);
      const reason = error?.code === 1 ? 'PERMISSION DENIED' : error?.code === 2 ? 'POSITION UNAVAILABLE' : 'LOCATION TIMEOUT';
      setStatus(`LOCATION ERROR // ${reason}`, 'warn');
      setCoordinateStatus(`LOCATION ERROR // ${reason}`, 'warn');
    },
    {
      enableHighAccuracy: true,
      timeout: LOCATION_TIMEOUT,
      maximumAge: 60_000,
    },
  );
}

function showPanel(id) {
  const panel = $(id);
  if (!panel) return;
  document.querySelectorAll('.panel').forEach((item) => {
    if (item !== panel) item.hidden = true;
  });
  panel.hidden = false;
}

function hidePanel(id) {
  const panel = $(id);
  if (panel) panel.hidden = true;
}

async function loadVisualModes() {
  if (!visualModesLoad) {
    visualModesLoad = import('./visualModes.js').catch((error) => {
      visualModesLoad = null;
      throw error;
    });
  }
  return visualModesLoad;
}

async function openVisualPanel() {
  showPanel('visualPanel');
  setStatus('VISUAL SYSTEM // LOADING CONTROLS…');

  // The visual subsystem is deliberately loaded only when requested. Its
  // module installs the optics/HUD button handlers and imports its CSS.
  try {
    await loadVisualModes();
    setStatus('VISUAL SYSTEM // READY', 'ok');
  } catch (error) {
    console.warn('[GEV] Visual controls unavailable', error);
    hidePanel('visualPanel');
    setStatus('VISUAL SYSTEM // LOAD ERROR', 'warn');
  }
}

function closeCommandPanelForVisuals() {
  const menu = $('menuToggle');
  if (menu?.getAttribute('aria-expanded') === 'true') menu.click();
}

function install() {
  $('home')?.addEventListener('click', flyHome);
  $('locate')?.addEventListener('click', useCurrentLocation);
  $('coordinateLocation')?.addEventListener('click', useCurrentLocation);
  $('coordinateNav')?.addEventListener('click', () => showPanel('coordinatePanel'));
  $('coordinateClose')?.addEventListener('click', () => hidePanel('coordinatePanel'));
  $('ionSettings')?.addEventListener('click', () => showPanel('ionPanel'));
  $('ionClose')?.addEventListener('click', () => hidePanel('ionPanel'));
  $('targetClose')?.addEventListener('click', () => hidePanel('targetPanel'));
  $('visualSettings')?.addEventListener('click', () => {
    closeCommandPanelForVisuals();
    void openVisualPanel();
  });
  $('visualClose')?.addEventListener('click', () => hidePanel('visualPanel'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true });
} else {
  install();
}
