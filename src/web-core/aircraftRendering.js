import * as Cesium from 'cesium';

const GLYPH_SIZE = 64;
const DEFAULT_SCALE = 0.72;
const SELECTED_SCALE = 1.15;

const COLORS = {
  civilian: '#00eaff',
  military: '#ff9f2f',
};

const glyphCanvases = new Map();

function glyphCanvas(color) {
  if (glyphCanvases.has(color)) return glyphCanvases.get(color);

  const canvas = document.createElement('canvas');
  canvas.width = GLYPH_SIZE;
  canvas.height = GLYPH_SIZE;
  const context = canvas.getContext('2d');
  if (!context) return canvas;

  context.clearRect(0, 0, GLYPH_SIZE, GLYPH_SIZE);
  context.beginPath();
  context.moveTo(32, 4);
  context.lineTo(43, 35);
  context.lineTo(36, 32);
  context.lineTo(36, 56);
  context.lineTo(28, 56);
  context.lineTo(28, 32);
  context.lineTo(21, 35);
  context.closePath();
  context.fillStyle = color;
  context.globalAlpha = 0.96;
  context.fill();
  context.globalAlpha = 1;
  context.lineWidth = 3;
  context.strokeStyle = '#020508';
  context.lineJoin = 'round';
  context.stroke();

  context.beginPath();
  context.moveTo(32, 9);
  context.lineTo(38, 31);
  context.lineTo(32, 28);
  context.lineTo(26, 31);
  context.closePath();
  context.fillStyle = '#ffffff';
  context.globalAlpha = 0.16;
  context.fill();
  context.globalAlpha = 1;

  glyphCanvases.set(color, canvas);
  return canvas;
}

function getAircraftLayers(scene) {
  const layers = scene?.__gevWebCoreLayers;
  if (layers instanceof Map) {
    return ['civilianAircraft', 'militaryAircraft']
      .map((id) => layers.get(id))
      .filter(Boolean)
      .map((layer) => layer.dataSource)
      .filter(Boolean);
  }

  return (scene?.dataSources?.values || []).filter((dataSource) =>
    dataSource?.name === 'civilianAircraft' || dataSource?.name === 'militaryAircraft'
  );
}

function getScene() {
  return window.__gevScene || window.__gevViewer?.scene || null;
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
    show: true,
    image: glyphCanvas(color),
    width: GLYPH_SIZE,
    height: GLYPH_SIZE,
    scale: DEFAULT_SCALE,
    rotation: -Cesium.Math.toRadians(headingFor(entity)),
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    color: Cesium.Color.WHITE,
    scaleByDistance: new Cesium.NearFarScalar(1.5e5, 1.0, 8.0e6, 0.45),
  });

  entity.billboard.__gevAircraftDirectional = true;
  entity.billboard.__gevAircraftClassification = classification;

  if (entity.point) {
    entity.point.show = false;
    entity.point.pixelSize = 2;
    entity.point.outlineWidth = 1;
  }
  if (entity.label) entity.label.show = false;
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
    }
  }
}

function install() {
  const scene = getScene();
  const layers = getAircraftLayers(scene);

  if (!layers.length) {
    requestAnimationFrame(install);
    return;
  }

  for (const layer of layers) {
    for (const entity of layer.entities.values) patchAircraftEntity(entity);
    layer.entities.collectionChanged.addEventListener((_collection, added) => {
      for (const entity of added) patchAircraftEntity(entity);
      syncSelection(layers);
    });
  }

  const panel = document.getElementById('targetPanel');
  if (panel && !panel.__gevAircraftRenderingObserver) {
    const observer = new MutationObserver(() => syncSelection(layers));
    observer.observe(panel, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
    panel.__gevAircraftRenderingObserver = observer;
  }

  syncSelection(layers);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
