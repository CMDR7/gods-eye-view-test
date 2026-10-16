import * as Cesium from 'cesium';

const PATCH_FLAG = '__gevScreenTargetResolverPatched';
const RESOLVER_FLAG = '__gevProjectedResolverInstalled';
const SATELLITE_RADIUS_PX = 46;
const AIRCRAFT_RADIUS_PX = 38;
const GROUND_RADIUS_PX = 32;

function targetRadius(entity) {
  switch (entity.gevMeta?.type) {
    case 'SATELLITE':
      return SATELLITE_RADIUS_PX;
    case 'AIRCRAFT':
      return AIRCRAFT_RADIUS_PX;
    case 'EARTHQUAKE':
      return GROUND_RADIUS_PX;
    default:
      return GROUND_RADIUS_PX;
  }
}

function isSelectableEntity(entity, dataSource) {
  return entity instanceof Cesium.Entity
    && Boolean(entity.gevMeta)
    && entity.show !== false
    && entity.isShowing !== false
    && dataSource?.show !== false
    && entity.position;
}

function getGevEntities(scene) {
  const entities = [];
  const dataSources = scene?.dataSources?.values || [];

  for (const dataSource of dataSources) {
    if (dataSource?.show === false || !dataSource?.entities) continue;
    for (const entity of dataSource.entities.values || []) {
      if (isSelectableEntity(entity, dataSource)) entities.push(entity);
    }
  }

  return entities;
}

function resolveProjectedTarget(scene, windowPosition) {
  if (!scene || !Cesium.defined(windowPosition)) return undefined;

  // ScreenSpaceEventHandler / pointer events use a top-left CSS-pixel origin
  // for the canvas interaction path. cartesianToCanvasCoordinates() uses the
  // same canvas coordinate system, so this avoids the window/drawing-buffer
  // and bottom-left/top-left ambiguity on high-DPI mobile browsers.
  const canvas = scene.canvas;
  const canvasRect = canvas?.getBoundingClientRect?.();
  const canvasHeight = canvas?.clientHeight || canvasRect?.height || 0;
  if (!canvasHeight) return undefined;

  const canvasPoint = new Cesium.Cartesian2(
    windowPosition.x,
    canvasHeight - windowPosition.y,
  );

  let best;
  let bestDistance = Number.POSITIVE_INFINITY;
  const now = Cesium.JulianDate.now();
  const projected = new Cesium.Cartesian2();

  for (const entity of getGevEntities(scene)) {
    let worldPosition;
    try {
      worldPosition = entity.position.getValue(now);
    } catch {
      continue;
    }
    if (!Cesium.defined(worldPosition)) continue;

    // Cesium's canvas-space coordinates are top-left based and match the
    // rendered PointGraphics screen position.
    const screenPosition = scene.cartesianToCanvasCoordinates(worldPosition, projected);
    if (!Cesium.defined(screenPosition)) continue;

    const dx = screenPosition.x - canvasPoint.x;
    const dy = screenPosition.y - canvasPoint.y;
    const distance = Math.hypot(dx, dy);
    const radius = targetRadius(entity);
    if (distance > radius || distance >= bestDistance) continue;

    best = entity;
    bestDistance = distance;
  }

  return best;
}

function installSceneResolver(scene) {
  if (!scene || scene[RESOLVER_FLAG]) return;
  scene.__gevResolveProjectedTarget = (windowPosition) => resolveProjectedTarget(scene, windowPosition);
  scene[RESOLVER_FLAG] = true;
}

const originalPick = Cesium.Scene.prototype.pick;
if (originalPick && !originalPick[PATCH_FLAG]) {
  const projectedPick = function projectedTargetPick(windowPosition, width, height) {
    // The touch bridge places the projected entity here immediately before it
    // invokes Cesium's registered LEFT_CLICK action. Returning it from pick()
    // lets the existing main.js selection path remain unchanged.
    const touchTarget = this.__gevTouchTarget;
    if (touchTarget?.gevMeta) return { id: touchTarget, primitive: touchTarget };

    const picked = originalPick.call(this, windowPosition, width, height);
    if (Cesium.defined(picked)) {
      const pickedId = Cesium.defaultValue(picked.id, picked.primitive?.id);
      if (pickedId instanceof Cesium.Entity && pickedId.gevMeta) return picked;
    }

    const entity = this.__gevResolveProjectedTarget?.(windowPosition);
    if (entity) return { id: entity, primitive: entity };
    return picked;
  };

  projectedPick[PATCH_FLAG] = true;
  projectedPick.__gevOriginalPick = originalPick;
  Cesium.Scene.prototype.pick = projectedPick;
}

// Capture every Cesium scene so the mobile touch bridge can use the same
// resolver without depending on module execution order or EntityCollection
// prototype patches.
const originalRender = Cesium.Scene.prototype.render;
const RENDER_PATCH_FLAG = '__gevProjectedResolverRenderPatched';
if (originalRender && !originalRender[RENDER_PATCH_FLAG]) {
  const patchedRender = function projectedResolverRender(time) {
    installSceneResolver(this);
    return originalRender.call(this, time);
  };
  patchedRender[RENDER_PATCH_FLAG] = true;
  Cesium.Scene.prototype.render = patchedRender;
}

console.info('[GEV] Screen-space target resolver ready');
