import * as Cesium from 'cesium';

const POLL_MS = 350;
const POINT_PIXEL_SIZE = 7;
const TOUCH_RADIUS_PX = 42;
const COLLECTION_FLAG = '__gevNativeSatellitePickCollection';
const SYNC_FLAG = '__gevNativeSatellitePickSync';
const OVERLAY_FLAG = '__gevSatelliteScreenDiagnostic';

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

function getCanvasMetrics(canvas) {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = rect.width || canvas.clientWidth || 1;
  const cssHeight = rect.height || canvas.clientHeight || 1;
  const bufferWidth = canvas.width || cssWidth;
  const bufferHeight = canvas.height || cssHeight;
  return {
    cssWidth,
    cssHeight,
    bufferWidth,
    bufferHeight,
    scaleX: cssWidth / bufferWidth,
    scaleY: cssHeight / bufferHeight,
  };
}

function getProjectedPositions(scene, point, metrics, scratch) {
  let raw;
  try {
    raw = point.computeScreenSpacePosition(scene, scratch.raw);
  } catch {
    return null;
  }
  if (!Cesium.defined(raw)) return null;

  return {
    raw: new Cesium.Cartesian2(raw.x, raw.y),
    scaled: new Cesium.Cartesian2(raw.x * metrics.scaleX, raw.y * metrics.scaleY),
  };
}

function ensureDiagnosticOverlay(scene) {
  const canvas = scene?.canvas;
  if (!canvas) return null;
  let overlay = canvas[OVERLAY_FLAG];
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.dataset.gevSatelliteDiagnostic = 'true';
  Object.assign(overlay.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '9000',
    overflow: 'hidden',
  });
  document.body.appendChild(overlay);
  canvas[OVERLAY_FLAG] = overlay;
  return overlay;
}

function drawDiagnosticOverlay(scene) {
  const canvas = scene?.canvas;
  const overlay = ensureDiagnosticOverlay(scene);
  if (!canvas || !overlay) return;

  const rect = canvas.getBoundingClientRect();
  const metrics = getCanvasMetrics(canvas);
  overlay.replaceChildren();

  const collection = scene[COLLECTION_FLAG];
  if (!collection || collection.show === false) return;

  const scratch = { raw: new Cesium.Cartesian2() };
  for (let index = 0; index < collection.length; index += 1) {
    const point = collection.get(index);
    if (!point || point.show === false) continue;
    const positions = getProjectedPositions(scene, point, metrics, scratch);
    if (!positions) continue;

    const marker = document.createElement('div');
    Object.assign(marker.style, {
      position: 'fixed',
      width: '14px',
      height: '14px',
      left: `${rect.left + positions.scaled.x - 7}px`,
      top: `${rect.top + positions.scaled.y - 7}px`,
      border: '1px solid rgba(255, 150, 40, 0.85)',
      borderRadius: '50%',
      boxSizing: 'border-box',
      opacity: '0.75',
    });
    overlay.appendChild(marker);

    const rawMarker = document.createElement('div');
    Object.assign(rawMarker.style, {
      position: 'fixed',
      width: '5px',
      height: '5px',
      left: `${rect.left + positions.raw.x - 2.5}px`,
      top: `${rect.top + positions.raw.y - 2.5}px`,
      background: 'rgba(70, 220, 255, 0.9)',
      borderRadius: '50%',
      opacity: '0.8',
    });
    overlay.appendChild(rawMarker);
  }
}

function resolveNativeScreenTarget(scene, canvasX, canvasY) {
  const collection = scene?.[COLLECTION_FLAG];
  const canvas = scene?.canvas;
  if (!collection || collection.show === false || !canvas) return undefined;

  const metrics = getCanvasMetrics(canvas);
  const tap = new Cesium.Cartesian2(canvasX, canvasY);
  const scratch = { raw: new Cesium.Cartesian2() };
  let best;
  let bestDistance = TOUCH_RADIUS_PX;
  let bestMode = '';
  let bestProjected;
  let visibleCount = 0;

  for (let index = 0; index < collection.length; index += 1) {
    const point = collection.get(index);
    if (!point || point.show === false) continue;
    const positions = getProjectedPositions(scene, point, metrics, scratch);
    if (!positions) continue;
    visibleCount += 1;

    const rawDistance = Cesium.Cartesian2.distance(tap, positions.raw);
    const scaledDistance = Cesium.Cartesian2.distance(tap, positions.scaled);
    const distance = Math.min(rawDistance, scaledDistance);
    const mode = rawDistance <= scaledDistance ? 'RAW' : 'SCALED';
    const projected = mode === 'RAW' ? positions.raw : positions.scaled;

    if (distance <= bestDistance) {
      bestDistance = distance;
      best = point;
      bestMode = mode;
      bestProjected = projected;
    }
  }

  return {
    entity: best?.id instanceof Cesium.Entity ? best.id : undefined,
    distance: best ? bestDistance : null,
    mode: best ? bestMode : 'NONE',
    projected: bestProjected,
    visibleCount,
    metrics,
  };
}

function showTapDiagnostic(scene, event, result, canvasX, canvasY) {
  const status = document.getElementById('status');
  if (!status) return;

  const scale = result?.metrics;
  const scaleText = scale ? `${scale.scaleX.toFixed(2)}X/${scale.scaleY.toFixed(2)}Y` : '—';
  if (result?.entity) {
    status.textContent = `DIRECT SCREEN TARGET // ${result.mode} // D ${result.distance.toFixed(1)}PX // ${result.entity.gevMeta?.id || result.entity.id}`;
    status.dataset.type = 'ok';
    return;
  }

  const nearest = result?.distance == null ? '—' : `${result.distance.toFixed(1)}PX`;
  status.textContent = `SCREEN DIAG // NO HIT // NEAREST ${nearest} // ${result?.visibleCount || 0} PTS // SCALE ${scaleText}`;
  status.dataset.type = 'warn';
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
    const result = resolveNativeScreenTarget(scene, canvasX, canvasY);
    showTapDiagnostic(scene, event, result, canvasX, canvasY);

    if (result.entity) {
      scene.__gevDirectSatelliteTarget = result.entity;
    }
  }, { passive: true });
}

function start() {
  const sync = () => {
    const scene = getScene();
    if (!scene) return;
    syncNativeSatellitePoints(scene);
    installDirectTouchResolver(scene);
    drawDiagnosticOverlay(scene);
  };

  sync();
  window.setInterval(sync, POLL_MS);
  console.info('[GEV] Native satellite screen diagnostic ready');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
