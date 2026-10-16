import * as Cesium from 'cesium';

const POLL_MS = 350;
const POINT_PIXEL_SIZE = 7;
const TOUCH_RADIUS_PX = 42;
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

function resolveNativeScreenTarget(scene, canvasX, canvasY) {
  const collection = scene?.[COLLECTION_FLAG];
  if (!collection || collection.show === false) return undefined;

  const tap = new Cesium.Cartesian2(canvasX, canvasY);
  const projected = new Cesium.Cartesian2();
  let best;
  let bestDistance = TOUCH_RADIUS_PX;

  for (let index = 0; index < collection.length; index += 1) {
    const point = collection.get(index);
    if (!point || point.show === false) continue;

    let screenPosition;
    try {
      screenPosition = point.computeScreenSpacePosition(scene, projected);
    } catch {
      continue;
    }
    if (!Cesium.defined(screenPosition)) continue;

    const distance = Cesium.Cartesian2.distance(tap, screenPosition);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }

  return best?.id instanceof Cesium.Entity ? best.id : undefined;
}

function installDirectTouchResolver(scene) {
  const canvas = scene?.canvas;
  if (!canvas || canvas.__gevDirectSatelliteTouchInstalled) return;
  canvas.__gevDirectSatelliteTouchInstalled = true;
  canvas.style.touchAction = 'none';

  let startX = 0;
  let startY = 0;
  let pointerId = null;
  let moved = false;

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if (event.isPrimary === false) return;
    startX = event.clientX;
    startY = event.clientY;
    pointerId = event.pointerId;
    moved = false;
  }, { passive: true });

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 14) moved = true;
  }, { passive: true });

  canvas.addEventListener('pointerup', (event) => {
    if (event.pointerId !== pointerId) return;
    const wasTap = !moved && Math.hypot(event.clientX - startX, event.clientY - startY) <= 14;
    pointerId = null;
    if (!wasTap) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    const entity = resolveNativeScreenTarget(scene, canvasX, canvasY);

    const status = document.getElementById('status');
    if (entity) {
      scene.__gevDirectSatelliteTarget = entity;
      if (status) {
        status.textContent = `DIRECT SCREEN TARGET // SATELLITE // ${entity.gevMeta?.id || entity.id}`;
        status.dataset.type = 'ok';
      }

      const handler = scene.screenSpaceCameraController ? scene._screenSpaceEventHandler : null;
      const inputHandler = handler || scene.viewer?.screenSpaceEventHandler;
      const action = inputHandler?.getInputAction?.(Cesium.ScreenSpaceEventType.LEFT_CLICK);
      if (typeof action === 'function') {
        const windowPosition = new Cesium.Cartesian2(canvasX, canvas.clientHeight - canvasY);
        action({ position: windowPosition, __gevTarget: entity, __gevTargetSource: 'DIRECT_SCREEN' });
      }
      window.setTimeout(() => {
        scene.__gevDirectSatelliteTarget = null;
      }, 0);
    } else if (status) {
      status.textContent = 'DIRECT SCREEN TEST // NO SATELLITE AT TAP';
      status.dataset.type = 'warn';
    }
  }, { passive: true });
}

function start() {
  const sync = () => {
    const scene = getScene();
    if (!scene) return;
    syncNativeSatellitePoints(scene);
    installDirectTouchResolver(scene);
  };

  sync();
  window.setInterval(sync, POLL_MS);
  console.info('[GEV] Native satellite PointPrimitive direct screen test ready');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
