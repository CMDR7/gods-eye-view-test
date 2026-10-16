import * as Cesium from 'cesium';

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
out vec4 out_FragColor;

void main() {
  vec2 uv = v_textureCoordinates;
  vec4 source = texture(colorTexture, uv);
  vec3 rgb = source.rgb;
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));

  // NVG: restrained phosphor-green night-vision treatment.
  if (mode > 0.5 && mode < 1.5) {
    float enhanced = smoothstep(0.05, 0.9, lum) * 1.12;
    rgb = vec3(enhanced * 0.12, enhanced * 0.82, enhanced * 0.30);
    rgb += vec3(0.0, 0.035, 0.012) * sin(uv.y * 900.0 + time * 0.35);
  }

  // FLIR: luminance mapped into a restrained cyan/amber thermal palette.
  if (mode > 1.5 && mode < 2.5) {
    float t = smoothstep(0.04, 0.92, lum);
    vec3 cold = vec3(0.015, 0.10, 0.16);
    vec3 mid = vec3(0.05, 0.65, 0.78);
    vec3 hot = vec3(1.0, 0.55, 0.08);
    rgb = t < 0.55 ? mix(cold, mid, t / 0.55) : mix(mid, hot, (t - 0.55) / 0.45);
  }

  // CRT: subtle scanlines and phosphor contrast; preserve the underlying map.
  if (mode > 2.5) {
    float scan = 0.94 + 0.06 * sin(uv.y * 1100.0 + time * 1.8);
    float vignette = 1.0 - 0.10 * smoothstep(0.45, 0.82, distance(uv, vec2(0.5)));
    rgb *= scan * vignette;
    rgb += vec3(0.0, 0.008, 0.012);
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

function applyMode(mode, { persist = true, announce = true } = {}) {
  const normalized = MODES.has(mode) ? mode : 'normal';
  const scene = getScene();
  const stage = ensureStage(scene);

  if (stage) {
    stage.uniforms.mode = normalized === 'normal' ? 0 : normalized === 'nvg' ? 1 : normalized === 'flir' ? 2 : 3;
    stage.enabled = normalized !== 'normal';
  }

  document.documentElement.dataset.gevVisualMode = normalized;
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
  document.documentElement.dataset.gevHud = normalized;
  document.querySelectorAll('[data-hud-layout]').forEach((button) => {
    const active = button.dataset.hudLayout === normalized;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (persist) write(HUD_STORAGE_KEY, normalized);
  if (announce) setStatus(`HUD // ${normalized.toUpperCase()}`, 'ok');
}

function install() {
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
