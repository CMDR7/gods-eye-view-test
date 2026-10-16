import * as Cesium from 'cesium';

const RESOLVER_FLAG = '__gevProjectedResolverInstalled';
const SATELLITE_RADIUS_PX = 52;
const AIRCRAFT_RADIUS_PX = 42;
const GROUND_RADIUS_PX = 34;

function targetRadius(entity) {
  switch (entity.gevMeta?.type) {
    case 'SATELLITE':
      return SATELLITE_RADIUS_PX;
    case 'AIRCRAFT':
      return AIRCRAFT_RADIUS_PX;
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

// Resolve directly in the same top-left CSS-pixel coordinate system as the
// PointerEvent. We deliberately do not convert this point into Cesium window
// coordinates until after the target has been identified. This removes the
// mobile/high-DPI origin ambiguity that caused valid taps to fall through to
// globe picking.
function resolveProjectedTarget(scene, canvasX, canvasY) {
  if (!scene || !Number.isFinite(canvasX) || !Number.isFinite(canvasY)) return undefined;

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

    const screenPosition = scene.cartesianToCanvasCoordinates(worldPosition, projected);
    if (!Cesium.defined(screenPosition)) continue;

    const distance = Math.hypot(screenPosition.x - canvasX, screenPosition.y - canvasY);
    const radius = targetRadius(entity);
    if (distance > radius || distance >= bestDistance) continue;

    best = entity;
    bestDistance = distance;
  }

  return best;
}

function installSceneResolver(scene) {
  if (!scene || scene[RESOLVER_FLAG]) return;
  scene.__gevResolveProjectedTarget = (canvasX, canvasY) => resolveProjectedTarget(scene, canvasX, canvasY);
  scene[RESOLVER_FLAG] = true;
}

// The touch bridge installs the resolver on the scene during render. Keep the
// patch deliberately small: it does not alter Cesium's native picking rules.
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
