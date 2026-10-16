import * as Cesium from 'cesium';

const POLL_MS = 350;
const POINT_PIXEL_SIZE = 7;
const COLLECTION_FLAG = '__gevNativeSatellitePickCollection';
const SYNC_FLAG = '__gevNativeSatellitePickSync';

function getScene() {
  const canvas = document.querySelector('#cesiumContainer canvas, #globe canvas');
  return canvas?.__gevScene || null;
}

function getSatelliteLayer(scene) {
  return scene?.dataSources?.getByName?.('satellites')?.[0] || null;
}

function syncNativeSatellitePoints(scene) {
  const layer = getSatelliteLayer(scene);
  if (!layer) return;

  let collection = scene[COLLECTION_FLAG];
  if (!collection) {
    collection = new Cesium.PointPrimitiveCollection();
    scene.primitives.add(collection);
    scene[COLLECTION_FLAG] = collection;
    scene[SYNC_FLAG] = '';
  }

  collection.show = layer.show !== false;
  const entities = layer.entities?.values || [];
  const signature = entities.map((entity) => `${entity.id}:${entity.position?.getValue?.(Cesium.JulianDate.now())?.toString?.() || ''}`).join('|');
  if (signature === scene[SYNC_FLAG]) return;

  collection.removeAll();
  for (const entity of entities) {
    if (!(entity instanceof Cesium.Entity) || !entity.gevMeta || entity.gevMeta.type !== 'SATELLITE') continue;
    const position = entity.position?.getValue?.(Cesium.JulianDate.now());
    if (!Cesium.defined(position)) continue;

    collection.add({
      position,
      pixelSize: POINT_PIXEL_SIZE,
      color: Cesium.Color.LIME.withAlpha(0.55),
      outlineColor: Cesium.Color.WHITE.withAlpha(0.9),
      outlineWidth: 1,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      id: entity,
    });
  }

  scene[SYNC_FLAG] = signature;
  if (entities.length) {
    console.info(`[GEV] Native satellite pick test synced ${collection.length} points`);
  }
}

function start() {
  const sync = () => {
    const scene = getScene();
    if (scene) syncNativeSatellitePoints(scene);
  };

  sync();
  window.setInterval(sync, POLL_MS);
  console.info('[GEV] Native satellite PointPrimitiveCollection test ready');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
