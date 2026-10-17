import * as Cesium from 'cesium';

const TIME_HUD_ID = 'gevTimeHud';
const RETRY_LIMIT = 120;

function ensureHud() {
  let hud = document.getElementById(TIME_HUD_ID);
  if (hud) return hud;

  hud = document.createElement('div');
  hud.id = TIME_HUD_ID;
  hud.setAttribute('aria-label', 'GEV real-time clock');
  hud.innerHTML = '<span class="gevTimeMode">TIME // LIVE</span><span class="gevTimeValue">UTC --:--:--</span><span class="gevTimeRate">SIM ×1.0</span>';
  hud.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:max(12px, env(safe-area-inset-bottom))',
    'transform:translateX(-50%)',
    'z-index:9',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'padding:5px 9px',
    'border:1px solid rgba(90,220,255,.24)',
    'background:rgba(4,8,12,.62)',
    'backdrop-filter:blur(5px)',
    'font:600 10px/1 monospace',
    'letter-spacing:.12em',
    'color:rgba(190,235,255,.86)',
    'pointer-events:none',
    'white-space:nowrap',
  ].join(';');
  document.getElementById('app')?.appendChild(hud);
  return hud;
}

function formatUtc(time) {
  const date = Cesium.JulianDate.toDate(time);
  return date.toISOString().slice(11, 19);
}

function install(viewer, attempt = 0) {
  if (!viewer?.clock || !viewer?.scene) {
    if (attempt < RETRY_LIMIT) requestAnimationFrame(() => install(window.__gevViewer, attempt + 1));
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

  const hud = ensureHud();
  const mode = hud.querySelector('.gevTimeMode');
  const value = hud.querySelector('.gevTimeValue');
  const rate = hud.querySelector('.gevTimeRate');

  const update = (currentTime) => {
    if (!currentTime) return;
    const live = Math.abs(Cesium.JulianDate.secondsDifference(currentTime, Cesium.JulianDate.now())) < 2;
    mode.textContent = live ? 'TIME // LIVE' : 'TIME // SIM';
    value.textContent = `UTC ${formatUtc(currentTime)}`;
    rate.textContent = `SIM ×${Number(clock.multiplier).toFixed(1)}`;
  };

  clock.onTick.addEventListener(update);
  update(clock.currentTime);
  viewer.scene.requestRender();

  window.__gevTimeSystem = { clock, viewer, update };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => install(window.__gevViewer), { once: true });
} else {
  install(window.__gevViewer);
}
