import * as Cesium from 'cesium';

const COLLECTION_KEY = '__gevNativeSatelliteCollection';
const LEGACY_COLLECTION_KEY = '__gevSatellitePointCollection';
const POLL_MS = 500;
const TOUCH_RADIUS_PX = 46;

function getScene() {
  const canvas = document.querySelector('#globe canvas');
  return canvas?.__gevScene || null;
}

function resolveScreenTarget(scene, windowPosition) {
  const collection = scene?.[COLLECTION_KEY];
  const canvas = scene?.canvas;
  if (!collection || !collection.show || !canvas || !Cesium.defined(windowPosition)) return undefined;

  const canvasHeight = canvas.clientHeight || canvas.getBoundingClientRect?.().height || 0;
  if (!canvasHeight) return undefined;

  const tap = new Cesium.Cartesian2(windowPosition.x, canvasHeight - windowPosition.y);
  let best;
  let bestDistance = Number.POSITIVE_INFINITY;
  const projected = new Cesium.Cartesian2();

  for (let index = 0; index < collection.length; index += 1) {
    const point = collection.get(index);
    if (!point?.show || !point.id?.gevMeta) continue;

    let screenPosition;
    try {
      screenPosition = point.computeScreenSpacePosition(scene, projected);
    } catch {
      continue;
    }
    if (!Cesium.defined(screenPosition)) continue;

    const distance = Cesium.Cartesian2.distance(tap, screenPosition);
    if (distance > TOUCH_RADIUS_PX || distance >= bestDistance) continue;
    best = point.id;
    bestDistance = distance;
  }

  return best;
}

function sync(scene) {
  const layer = scene?.__gevWebCoreLayers?.get?.('satellites');
  const canvas = scene?.canvas;
  if (!layer || !canvas) return;

  // Disable the temporary collection created by main.js. The native collection
  // below is the single authoritative satellite render/pick representation.
  const legacyCollection = scene[LEGACY_COLLECTION_KEY];
  if (legacyCollection) legacyCollection.show = false;

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

  scene.__gevPickNativeSatellite = (windowPosition) => resolveScreenTarget(scene, windowPosition);

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
