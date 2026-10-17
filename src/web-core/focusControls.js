import * as Cesium from 'cesium';

const FOCUS_LEVELS = [
  { id: 'global', label: 'GLOBAL', factor: 4.0 },
  { id: 'regional', label: 'REGIONAL', factor: 2.0 },
  { id: 'local', label: 'LOCAL', factor: 0.8 },
  { id: 'tight', label: 'TIGHT', factor: 0.25 },
  { id: 'target', label: 'TARGET', factor: 0.08 },
];
const DEFAULT_LEVEL = 'local';
const MIN_RANGE = 2_500;
const MAX_RANGE = 20_000_000;
const BASE_CONTEXT_RANGE = 250_000;

const $ = (id) => document.getElementById(id);

let activeTargetKey = '';
let focused = false;
let currentLevel = DEFAULT_LEVEL;
let focusBusy = false;

function getScene() {
  return document.querySelector('#globe canvas')?.__gevScene || null;
}

function setStatus(message, type = 'info') {
  const el = $('status');
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

function getTargetKey() {
  const panel = $('targetPanel');
  if (!panel || panel.hidden) return '';
  const type = $('targetType')?.textContent?.trim() || '';
  const id = $('targetId')?.textContent?.trim() || '';
  return type && id && id !== '—' ? `${type}:${id}` : '';
}

function findSelectedEntity() {
  const key = getTargetKey();
  if (!key) return null;
  const [type, ...idParts] = key.split(':');
  const id = idParts.join(':');
  const scene = getScene();
  if (!scene) return null;

  for (const dataSource of scene.dataSources?.values || []) {
    for (const entity of dataSource.entities?.values || []) {
      const meta = entity?.gevMeta;
      if (meta?.type === type && String(meta.id) === id) return entity;
    }
  }
  return null;
}

function getBaseRange(entity) {
  const altitude = Number(entity?.gevMeta?.altitude);
  if (Number.isFinite(altitude) && altitude > 10_000) {
    return Math.max(50_000, altitude * 0.75);
  }
  return BASE_CONTEXT_RANGE;
}

function getRange(entity, levelId) {
  const level = FOCUS_LEVELS.find((item) => item.id === levelId) || FOCUS_LEVELS[2];
  return Cesium.Math.clamp(getBaseRange(entity) * level.factor, MIN_RANGE, MAX_RANGE);
}

function renderFocusState() {
  const button = $('targetFocus');
  const levels = $('focusLevels');
  if (!button || !levels) return;

  button.textContent = focused ? `FOCUS // ${currentLevel.toUpperCase()}` : 'FOCUS';
  button.classList.toggle('active', focused);
  button.setAttribute('aria-pressed', focused ? 'true' : 'false');
  levels.hidden = !focused;

  levels.querySelectorAll('[data-focus-level]').forEach((item) => {
    const active = focused && item.dataset.focusLevel === currentLevel;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function resetFocusState() {
  focused = false;
  currentLevel = DEFAULT_LEVEL;
  renderFocusState();
}

async function applyFocus(levelId = DEFAULT_LEVEL) {
  const entity = findSelectedEntity();
  if (!entity) {
    setStatus('FOCUS ERROR // NO TARGET SELECTED', 'warn');
    return;
  }

  const position = entity.position?.getValue(Cesium.JulianDate.now());
  if (!Cesium.defined(position)) {
    setStatus('FOCUS ERROR // POSITION UNAVAILABLE', 'warn');
    return;
  }

  const scene = getScene();
  const camera = scene?.camera;
  if (!camera) {
    setStatus('FOCUS ERROR // SCENE NOT READY', 'warn');
    return;
  }

  const level = FOCUS_LEVELS.find((item) => item.id === levelId) || FOCUS_LEVELS[2];
  const range = getRange(entity, level.id);
  const sphere = new Cesium.BoundingSphere(position, Math.max(1_000, Math.min(25_000, range * 0.02)));

  focused = true;
  currentLevel = level.id;
  renderFocusState();
  focusBusy = true;
  setStatus(`FOCUS // ${level.label} // ${entity.gevMeta?.type || 'TARGET'}`);

  try {
    camera.cancelFlight?.();
    await camera.flyToBoundingSphere(sphere, {
      duration: 1.15,
      offset: new Cesium.HeadingPitchRange(
        camera.heading,
        Cesium.Math.clamp(camera.pitch, Cesium.Math.toRadians(-70), Cesium.Math.toRadians(-10)),
        range,
      ),
    });
    setStatus(`FOCUS LOCK // ${level.label} // ${entity.gevMeta?.type || 'TARGET'}`, 'ok');
  } catch (error) {
    console.warn('[GEV] Focus navigation failed', error);
    setStatus('FOCUS ERROR // FLIGHT FAILED', 'warn');
  } finally {
    focusBusy = false;
  }
}

function installControls() {
  const panel = $('targetPanel');
  const actions = panel?.querySelector('.targetActions');
  if (!panel || !actions || $('targetFocus')) return;

  const button = document.createElement('button');
  button.id = 'targetFocus';
  button.type = 'button';
  button.setAttribute('aria-pressed', 'false');
  button.textContent = 'FOCUS';
  actions.insertBefore(button, actions.firstChild);

  const levels = document.createElement('div');
  levels.id = 'focusLevels';
  levels.className = 'focusLevels';
  levels.hidden = true;
  levels.setAttribute('role', 'group');
  levels.setAttribute('aria-label', 'Focus scale');
  levels.innerHTML = FOCUS_LEVELS.map(({ id, label }) => (
    `<button type="button" data-focus-level="${id}" aria-pressed="false">${label}</button>`
  )).join('');
  actions.insertAdjacentElement('afterend', levels);

  button.addEventListener('click', () => {
    if (focusBusy) return;
    void applyFocus(focused ? currentLevel : DEFAULT_LEVEL);
  });

  levels.querySelectorAll('[data-focus-level]').forEach((item) => {
    item.addEventListener('click', () => {
      if (focusBusy) return;
      void applyFocus(item.dataset.focusLevel);
    });
  });

  renderFocusState();
}

function observeTarget() {
  const panel = $('targetPanel');
  if (!panel) return;
  const check = () => {
    const key = getTargetKey();
    if (key !== activeTargetKey) {
      activeTargetKey = key;
      resetFocusState();
    }
  };
  const observer = new MutationObserver(check);
  observer.observe(panel, { attributes: true, childList: true, subtree: true, characterData: true });
  check();
}

function injectStyles() {
  if ($('gevFocusStyles')) return;
  const style = document.createElement('style');
  style.id = 'gevFocusStyles';
  style.textContent = `
    .targetActions #targetFocus { flex: 1.15; }
    .targetActions #targetFocus.active { border-color: rgba(0,220,255,.9); box-shadow: inset 0 1px 0 rgba(190,245,255,.28), 0 0 18px rgba(0,220,255,.22); }
    .focusLevels { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; margin-top: 7px; }
    .focusLevels button { min-width: 0; min-height: 30px; padding: 5px 3px; font-size: 7px; letter-spacing: .045em; }
    .focusLevels button.active { border-color: rgba(0,220,255,.9); background: rgba(0,100,130,.34); color: #e8fcff; box-shadow: 0 0 12px rgba(0,220,255,.16); }
    @media (max-width: 520px) {
      .focusLevels button { font-size: 6px; }
    }
  `;
  document.head.appendChild(style);
}

function install() {
  injectStyles();
  installControls();
  observeTarget();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true });
} else {
  install();
}
