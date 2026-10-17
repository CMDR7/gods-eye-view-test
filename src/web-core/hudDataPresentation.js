const HUD_PRESENTATION = {
  tactical: {
    pointScale: 1.0,
    labelTypes: new Set(['AIRCRAFT', 'EARTHQUAKE']),
    labelScale: 1.0,
    pointAlpha: 1.0,
  },
  operator: {
    pointScale: 1.16,
    labelTypes: new Set(['AIRCRAFT', 'EARTHQUAKE', 'SATELLITE']),
    labelScale: 1.0,
    pointAlpha: 1.0,
  },
  minimal: {
    pointScale: 0.82,
    labelTypes: new Set(),
    labelScale: 0.9,
    pointAlpha: 0.86,
  },
  cyber: {
    pointScale: 1.05,
    labelTypes: new Set(['AIRCRAFT', 'SATELLITE', 'EARTHQUAKE']),
    labelScale: 1.0,
    pointAlpha: 0.96,
  },
};

const DEFAULT_PROFILE = HUD_PRESENTATION.tactical;
const INSTALLED_KEY = '__gevHudDataPresentationInstalled';

function getScene() {
  return document.querySelector('#globe canvas')?.__gevScene || null;
}

function getProfile() {
  const key = document.documentElement.dataset.gevHud;
  return HUD_PRESENTATION[key] || DEFAULT_PROFILE;
}

function isSelectedEntity(entity) {
  const panel = document.getElementById('targetPanel');
  const targetId = document.getElementById('targetId')?.textContent?.trim();
  return Boolean(panel && !panel.hidden && targetId && String(entity?.gevMeta?.id) === targetId);
}

function setColorAlpha(color, alpha) {
  if (!color || typeof color.withAlpha !== 'function') return color;
  return color.withAlpha(alpha);
}

function applyEntity(entity, profile) {
  if (!entity?.gevVisual || !entity?.point || isSelectedEntity(entity)) return;

  const baseSize = Number(entity.gevVisual.pixelSize);
  const baseColor = entity.gevVisual.color;
  const size = Number.isFinite(baseSize) ? baseSize * profile.pointScale : entity.point.pixelSize;

  entity.point.pixelSize = size;
  entity.point.color = setColorAlpha(baseColor, profile.pointAlpha);

  if (entity.label) {
    const type = String(entity.gevMeta?.type || '').toUpperCase();
    entity.label.show = profile.labelTypes.has(type);
    entity.label.font = `${11 * profile.labelScale}px monospace`;
  }

  const satellitePoint = entity.__gevSatellitePoint;
  if (satellitePoint) {
    satellitePoint.pixelSize = size;
    satellitePoint.color = setColorAlpha(baseColor, profile.pointAlpha);
  }
}

function applyPresentation() {
  const scene = getScene();
  const layers = scene?.__gevWebCoreLayers;
  if (!layers) return;

  const profile = getProfile();
  for (const layer of layers.values()) {
    for (const entity of layer?.dataSource?.entities?.values || []) {
      applyEntity(entity, profile);
    }
  }
  scene.requestRender();
}

function observeLayers(scene) {
  const layers = scene?.__gevWebCoreLayers;
  if (!layers) return false;

  for (const layer of layers.values()) {
    const collection = layer?.dataSource?.entities;
    if (!collection || collection.__gevHudPresentationBound) continue;
    collection.__gevHudPresentationBound = true;
    collection.collectionChanged.addEventListener((_collection, added, changed) => {
      const profile = getProfile();
      for (const entity of [...(added || []), ...(changed || [])]) applyEntity(entity, profile);
      window.setTimeout(() => {
        for (const entity of [...(added || []), ...(changed || [])]) applyEntity(entity, profile);
      }, 0);
    });
  }
  return true;
}

function install(attempt = 0) {
  if (window[INSTALLED_KEY]) return;
  const scene = getScene();
  if (!scene?.__gevWebCoreLayers) {
    if (attempt < 600) requestAnimationFrame(() => install(attempt + 1));
    return;
  }

  window[INSTALLED_KEY] = true;

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.attributeName === 'data-gev-hud')) {
      applyPresentation();
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-gev-hud'] });

  observeLayers(scene);
  applyPresentation();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => install(), { once: true });
} else {
  install();
}

console.info('[GEV] HUD data presentation profiles ready');
