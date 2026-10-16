import * as Cesium from 'cesium';

const COLLECTION_KEY = '__gevNativeSatelliteCollection';
const POLL_MS = 500;

function getScene() {
  const canvas = document.querySelector('#globe canvas');
  return canvas?.__gevScene || null;
}

function sync(scene) {
  const layer = scene?.__gevWebCoreLayers?.get?.('satellites');
  const canvas = scene?.canvas;
  if (!layer || !canvas) return;

  let collection = scene[COLLECTION_KEY];
  if (!collection) {
    collection = scene.primitives.add(new Cesium.PointPrimitiveCollection());
    scene[COLLECTION_KEY] = collection;
  }

  collection.show = layer.enabled;

  const entities = layer.dataSource?.entities?.values || [];
  const visibleSatellites = entities.filter((entity) => entity?.gevMeta?.type === 'SATELLITE');
  const signature = visibleSatellites.map((entity) => entity.id).join('|');

  if (collection.__gevSignature !== signature) {
    collection.removeAll();
    for (const entity of visibleSatellites) {
      const position = entity.position?.getValue(Cesium.JulianDate.now());
      if (!Cesium.defined(position)) continue;
      const point = collection.add({
        position,
        pixelSize: entity.gevVisual?.pixelSize || 7,
        color: entity.gevVisual?.color || Cesium.Color.LIME,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        id: entity,
      });
      entity.__gevSatellitePoint = point;
      // Native PointPrimitive is now the authoritative visual/pick representation.
      if (entity.point) entity.point.show = false;
    }
    collection.__gevSignature = signature;
  } else {
    const now = Cesium.JulianDate.now();
    for (const entity of visibleSatellites) {
      const point = entity.__gevSatellitePoint;
      const position = entity.position?.getValue(now);
      if (point && Cesium.defined(position)) point.position = position;
      if (entity.point) entity.point.show = false;
    }
  }

  if (scene.__gevNativeSatelliteCollectionCount !== collection.length) {
    scene.__gevNativeSatelliteCollectionCount = collection.length;
    console.info(`[GEV] Native satellite layer ready // ${collection.length} points`);
  }
}

function start() {
  const tick = () => {
    const scene = getScene();
    if (scene) sync(scene);
  };
  tick();
  window.setInterval(tick, POLL_MS);
  console.info('[GEV] Native satellite layer active');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
