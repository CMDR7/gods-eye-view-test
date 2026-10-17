import * as Cesium from 'cesium';

const TIME_HUD_ID = 'gevTimeHud';
const RETRY_LIMIT = 600;
const UPDATE_INTERVAL_MS = 250;

function getHud() {
  return document.getElementById(TIME_HUD_ID);
}

function getScene() {
  return document.querySelector('#globe canvas')?.__gevScene || null;
}

function formatUtc(date) {
  return date.toISOString().slice(11, 19);
}

function install(attempt = 0) {
  const hud = getHud();
  if (!hud) {
    if (attempt < RETRY_LIMIT) requestAnimationFrame(() => install(attempt + 1));
    return;
  }

  const mode = hud.querySelector('.gevTimeMode');
  const value = hud.querySelector('.gevTimeValue');
  const rate = hud.querySelector('.gevTimeRate');
  if (!mode || !value || !rate) return;

  const scene = getScene();
  if (scene?.globe) {
    scene.globe.enableLighting = true;
    scene.globe.dynamicAtmosphereLighting = true;
    scene.globe.dynamicAtmosphereLightingFromSun = true;
    scene.requestRender();
  }

  const update = () => {
    const now = new Date();
    mode.textContent = 'TIME // LIVE';
    value.textContent = `UTC ${formatUtc(now)}`;
    rate.textContent = 'SIM ×1.0';
  };

  update();
  if (!window.__gevTimeSystem) {
    window.__gevTimeSystem = {
      update,
      timer: window.setInterval(update, UPDATE_INTERVAL_MS),
    };
  } else {
    window.__gevTimeSystem.update = update;
  }

  if (!scene && attempt < RETRY_LIMIT) {
    requestAnimationFrame(() => install(attempt + 1));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => install(), { once: true });
} else {
  install();
}
