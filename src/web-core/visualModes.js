import * as Cesium from 'cesium';
import './visualModes.css';

const STORAGE_KEY = 'gev.webCore.visualMode.v1';
const HUD_STORAGE_KEY = 'gev.webCore.hudLayout.v1';
const MODES = new Set(['normal', 'nvg', 'flir', 'crt']);
const HUD_LAYOUTS = new Set(['tactical', 'operator', 'minimal', 'cyber']);
const STAGE_KEY = '__gevWebCoreVisualStage';

const $ = (id) => document.getElementById(id);

function setStatus(message, type = 'info') {
  const el = $('status');
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

function read(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Persistence is optional.
  }
}

function getScene() {
  return document.querySelector('#globe canvas')?.__gevScene || null;
}

const fragmentShader = `
uniform sampler2D colorTexture;
uniform float mode;
uniform float time;
in vec2 v_textureCoordinates;

void main() {
  vec2 uv = v_textureCoordinates;
  vec4 source = texture(colorTexture, uv);
  vec3 rgb = source.rgb;
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));

  // NVG: preserve scene detail while applying a restrained phosphor-green lift.
  if (mode > 0.5 && mode < 1.5) {
    float lifted = smoothstep(0.025, 0.82, lum);
    vec3 phosphor = vec3(lifted * 0.08, lifted * 0.52, lifted * 0.17);
    float detail = smoothstep(0.035, 0.88, lum);
    rgb = mix(vec3(lum * 0.22), phosphor, 0.76);
    rgb += vec3(0.0, 0.018, 0.006) * detail;
    rgb *= 0.90 + 0.10 * sin(uv.y * 900.0 + time * 0.35);
  }

  // FLIR: restrained thermal ramp with dark detail retained at the low end.
  if (mode > 1.5 && mode < 2.5) {
    float t = smoothstep(0.035, 0.96, lum);
    vec3 cold = vec3(0.006, 0.018, 0.030);
    vec3 low = vec3(0.025, 0.16, 0.25);
    vec3 mid = vec3(0.22, 0.52, 0.42);
    vec3 warm = vec3(0.88, 0.62, 0.18);
    vec3 hot = vec3(1.0, 0.88, 0.62);
    vec3 thermal = t < 0.22
      ? mix(cold, low, t / 0.22)
      : t < 0.58
        ? mix(low, mid, (t - 0.22) / 0.36)
        : t < 0.84
          ? mix(mid, warm, (t - 0.58) / 0.26)
          : mix(warm, hot, (t - 0.84) / 0.16);
    rgb = mix(vec3(lum * 0.18), thermal, 0.86);
  }

  // CRT: subtle scanlines and vignette; the underlying globe remains dominant.
  if (mode > 2.5) {
    float scan = 0.978 + 0.022 * sin(uv.y * 1100.0 + time * 1.8);
    float vignette = 1.0 - 0.065 * smoothstep(0.45, 0.82, distance(uv, vec2(0.5)));
    rgb *= scan * vignette;
    rgb = mix(rgb, rgb * vec3(0.96, 1.0, 1.015), 0.42);
  }

  out_FragColor = vec4(clamp(rgb, 0.0, 1.0), source.a);
}`;

function ensureStage(scene) {
  if (!scene) return null;
  if (scene[STAGE_KEY]) return scene[STAGE_KEY];

  try {
    const stage = new Cesium.PostProcessStage({
      name: 'gev-web-core-visual-modes',
      fragmentShader,
      uniforms: {
        mode: 0,
        time: () => performance.now() / 1000,
      },
    });
    stage.enabled = false;
    scene.postProcessStages.add(stage);
    scene[STAGE_KEY] = stage;
    return stage;
  } catch (error) {
    console.warn('[GEV] Visual post-process unavailable', error);
    return null;
  }
}

function ensureHudOverlay() {
  if (document.getElementById('gevHudOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'gevHudOverlay';
  overlay.className = 'gevHudOverlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="gevHudFrame gevHudFrame--tl"></div>
    <div class="gevHudFrame gevHudFrame--tr"></div>
    <div class="gevHudFrame gevHudFrame--bl"></div>
    <div class="gevHudFrame gevHudFrame--br"></div>
    <div class="gevHudTopLeft">GEV // VISUAL SYSTEM</div>
    <div class="gevHudTopRight" data-hud-optics>OPTICS // NORMAL</div>
    <div class="gevHudReticle" aria-hidden="true"><span></span></div>
    <div class="gevHudReadout gevHudReadout--left">
      <span>TRACK // VISUAL</span><span>VECTOR // LOCKED</span>
    </div>
    <div class="gevHudReadout gevHudReadout--right">
      <span data-hud-layout-label>HUD // TACTICAL</span><span>LINK // WEB CORE</span>
    </div>
    <div class="gevHudBottom">PRESENTATION LAYER // DATA STATE UNCHANGED</div>
  `;
  document.getElementById('app')?.appendChild(overlay);
}

function applyMode(mode, { persist = true, announce = true } = {}) {
  const normalized = MODES.has(mode) ? mode : 'normal';
  const scene = getScene();
  const stage = normalized === 'normal' ? scene?.[STAGE_KEY] || null : ensureStage(scene);

  if (stage) {
    stage.uniforms.mode = normalized === 'normal' ? 0 : normalized === 'nvg' ? 1 : normalized === 'flir' ? 2 : 3;
    stage.enabled = normalized !== 'normal';
  }

  document.documentElement.dataset.gevVisualMode = normalized;
  const opticsLabel = document.querySelector('[data-hud-optics]');
  if (opticsLabel) opticsLabel.textContent = `OPTICS // ${normalized.toUpperCase()}`;
  document.querySelectorAll('[data-visual-mode]').forEach((button) => {
    const active = button.dataset.visualMode === normalized;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  if (persist) write(STORAGE_KEY, normalized);
  scene?.requestRender();
  if (announce) setStatus(`OPTICS // ${normalized.toUpperCase()}`, 'ok');
}

function applyHudLayout(layout, { persist = true, announce = true } = {}) {
  const normalized = HUD_LAYOUTS.has(layout) ? layout : 'tactical';
  ensureHudOverlay();
  document.documentElement.dataset.gevHud = normalized;
  const label = document.querySelector('[data-hud-layout-label]');
  if (label) label.textContent = `HUD // ${normalized.toUpperCase()}`;
  document.querySelectorAll('[data-hud-layout]').forEach((button) => {
    const active = button.dataset.hudLayout === normalized;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (persist) write(HUD_STORAGE_KEY, normalized);
  if (announce) setStatus(`HUD // ${normalized.toUpperCase()}`, 'ok');
}

function install() {
  ensureHudOverlay();
  document.querySelectorAll('[data-visual-mode]').forEach((button) => {
    button.addEventListener('click', () => applyMode(button.dataset.visualMode));
  });
  document.querySelectorAll('[data-hud-layout]').forEach((button) => {
    button.addEventListener('click', () => applyHudLayout(button.dataset.hudLayout));
  });

  applyMode(read(STORAGE_KEY, 'normal'), { persist: false, announce: false });
  applyHudLayout(read(HUD_STORAGE_KEY, 'tactical'), { persist: false, announce: false });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true });
} else {
  install();
}

console.info('[GEV] Web Core visual modes ready');
