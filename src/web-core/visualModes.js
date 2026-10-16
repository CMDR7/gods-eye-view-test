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

  // NVG: retain the original luminance structure while applying a restrained phosphor-green response.
  if (mode > 0.5 && mode < 1.5) {
    float contrast = smoothstep(0.02, 0.92, lum);
    float detail = mix(lum, contrast, 0.22);
    vec3 phosphor = vec3(detail * 0.06, detail * 0.66, detail * 0.18);
    rgb = mix(vec3(detail), phosphor, 0.78);
    rgb *= 0.97 + 0.03 * sin(uv.y * 900.0 + time * 0.35);
  }

  // FLIR: high-contrast thermal palette from black/deep blue through cyan, yellow, orange and white.
  if (mode > 1.5 && mode < 2.5) {
    float t = smoothstep(0.025, 0.93, lum);
    vec3 deep = vec3(0.002, 0.006, 0.018);
    vec3 blue = vec3(0.015, 0.055, 0.20);
    vec3 cyan = vec3(0.02, 0.72, 0.86);
    vec3 yellow = vec3(1.0, 0.92, 0.10);
    vec3 orange = vec3(1.0, 0.30, 0.015);
    vec3 white = vec3(1.0, 1.0, 0.96);
    vec3 thermal;

    if (t < 0.18) {
      thermal = mix(deep, blue, t / 0.18);
    } else if (t < 0.42) {
      thermal = mix(blue, cyan, (t - 0.18) / 0.24);
    } else if (t < 0.68) {
      thermal = mix(cyan, yellow, (t - 0.42) / 0.26);
    } else if (t < 0.88) {
      thermal = mix(yellow, orange, (t - 0.68) / 0.20);
    } else {
      thermal = mix(orange, white, (t - 0.88) / 0.12);
    }

    // Keep a small luminance contribution so coastlines, terrain and structures retain spatial detail.
    rgb = mix(vec3(lum * 0.24), thermal, 0.86);
  }

  // CRT: normal imagery first, with only subtle phosphor, scanline and edge characteristics.
  if (mode > 2.5) {
    float lifted = clamp((rgb - 0.5) * 1.035 + 0.5, 0.0, 1.0);
    float scan = 0.988 + 0.012 * sin(uv.y * 1100.0 + time * 1.8);
    float vignette = 1.0 - 0.035 * smoothstep(0.48, 0.82, distance(uv, vec2(0.5)));
    rgb = lifted * scan * vignette;
    rgb = mix(rgb, rgb * vec3(0.985, 1.0, 1.01), 0.30);
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
