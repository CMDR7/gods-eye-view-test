import * as Cesium from 'cesium';

const TIME_HUD_ID = 'gevTimeHud';
const RETRY_LIMIT = 600;

function getHud() {
  return document.getElementById(TIME_HUD_ID);
}

function formatUtc(time) {
  const date = Cesium.JulianDate.toDate(time);
  return date.toISOString().slice(11, 19);
}

function install(viewer, attempt = 0) {
  const hud = getHud();
  if (!viewer?.clock || !viewer?.scene || !hud) {
    if (attempt < RETRY_LIMIT) {
      requestAnimationFrame(() => install(window.__gevViewer, attempt + 1));
    }
    return;
  }

  const clock = viewer.clock;
  clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
  clock.multiplier = 1;
  clock.shouldAnimate = true;
  clock.canAnimate = true;
  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.dynamicAtmosphereLighting = true;
  viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;

  const mode = hud.querySelector('.gevTimeMode');
  const value = hud.querySelector('.gevTimeValue');
  const rate = hud.querySelector('.gevTimeRate');
  if (!mode || !value || !rate) return;

  const update = (currentTime) => {
    if (!currentTime) return;
    const live = Math.abs(Cesium.JulianDate.secondsDifference(currentTime, Cesium.JulianDate.now())) < 2;
    mode.textContent = live ? 'TIME // LIVE' : 'TIME // SIM';
    value.textContent = `UTC ${formatUtc(currentTime)}`;
    rate.textContent = `SIM ×${Number(clock.multiplier).toFixed(1)}`;
  };

  if (!window.__gevTimeSystem) {
    clock.onTick.addEventListener(update);
  }
  update(clock.currentTime);
  viewer.scene.requestRender();

  window.__gevTimeSystem = { clock, viewer, update };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => install(window.__gevViewer), { once: true });
} else {
  install(window.__gevViewer);
}
