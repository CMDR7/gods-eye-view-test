import * as Cesium from 'cesium';

const STYLE_ID = 'gev-aircraft-rendering';
const GLYPH_SIZE = 64;
const DEFAULT_SCALE = 0.72;
const SELECTED_SCALE = 1.15;

const COLORS = {
  civilian: '#00eaff',
  military: '#ff9f2f',
};

const glyphUrls = new Map();

function svgDataUrl(color) {
  const key = color;
  if (glyphUrls.has(key)) return glyphUrls.get(key);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${GLYPH_SIZE}" height="${GLYPH_SIZE}" viewBox="0 0 64 64">\n  <path d="M32 4 L43 35 L36 32 L36 56 L28 56 L28 32 L21 35 Z" fill="${color}" fill-opacity="0.96" stroke="#020508" stroke-width="3" stroke-linejoin="round"/>\n  <path d="M32 9 L38 31 L32 28 L26 31 Z" fill="#ffffff" fill-opacity="0.16"/>\n</svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  glyphUrls.set(key, url);
  return url;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .gev-aircraft-directional {
      image-rendering: auto;
    }
  `;
  document.head.appendChild(style);
}

function getAircraftLayers(scene) {
  return (scene?.dataSources?.values || []).filter((dataSource) =>
    dataSource?.name === 'civilianAircraft' || dataSource?.name === 'militaryAircraft'
  );
}

function headingFor(entity) {
  const motion = entity?.gevMeta?.motion || {};
  const track = Number(motion.trackDeg);
  if (Number.isFinite(track)) return track;
  const trueHeading = Number(motion.trueHeadingDeg);
  if (Number.isFinite(trueHeading)) return trueHeading;
  const selectedHeading = Number(entity?.gevMeta?.navigation?.selectedHeadingDeg);
  return Number.isFinite(selectedHeading) ? selectedHeading : 0;
}

function patchAircraftEntity(entity) {
  if (!entity?.gevMeta || entity.gevMeta.type !== 'AIRCRAFT') return;

  const classification = entity.gevMeta.classification === 'military' ? 'military' : 'civilian';
  const color = COLORS[classification];

  entity.billboard = new Cesium.BillboardGraphics({
    image: svgDataUrl(color),
    width: GLYPH_SIZE,
    height: GLYPH_SIZE,
    scale: DEFAULT_SCALE,
    rotation: -Cesium.Math.toRadians(headingFor(entity)),
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    disableDepthTestDistance: 0,
    color: Cesium.Color.WHITE,
    scaleByDistance: new Cesium.NearFarScalar(1.5e5, 1.0, 8.0e6, 0.45),
  });

  entity.billboard.__gevAircraftDirectional = true;
  entity.billboard.__gevAircraftClassification = classification;

  // Keep the existing point as the lightweight picking/selection anchor.
  if (entity.point) {
    entity.point.pixelSize = 2;
    entity.point.outlineWidth = 1;
  }
}

function selectedTargetId() {
  const panel = document.getElementById('targetPanel');
  if (!panel || panel.hidden) return null;
  return document.getElementById('targetId')?.textContent?.trim() || null;
}

function syncSelection(layers) {
  const selectedId = selectedTargetId();
  for (const layer of layers) {
    for (const entity of layer.entities.values) {
      if (!entity?.gevMeta || entity.gevMeta.type !== 'AIRCRAFT' || !entity.billboard?.__gevAircraftDirectional) continue;
      const id = String(entity.gevMeta.id ?? entity.id ?? '');
      const selected = Boolean(selectedId && id === selectedId);
      entity.billboard.scale = selected ? SELECTED_SCALE : DEFAULT_SCALE;
      entity.billboard.color = selected ? Cesium.Color.WHITE : Cesium.Color.WHITE;
    }
  }
}

function install(attempt = 0) {
  installStyles();
  const scene = document.querySelector('#globe canvas')?.__gevScene || null;
  const layers = getAircraftLayers(scene);

  if (layers.length) {
    for (const layer of layers) {
      for (const entity of layer.entities.values) patchAircraftEntity(entity);
      layer.entities.collectionChanged.addEventListener((_collection, added) => {
        for (const entity of added) patchAircraftEntity(entity);
        syncSelection(layers);
      });
    }

    const panel = document.getElementById('targetPanel');
    if (panel) {
      const observer = new MutationObserver(() => syncSelection(layers));
      observer.observe(panel, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['hidden'],
      });
    }

    syncSelection(layers);
    return;
  }

  if (attempt < 600) requestAnimationFrame(() => install(attempt + 1));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(), { once: true });
else install();
