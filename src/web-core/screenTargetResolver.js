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

// PointerEvent coordinates are measured from the top-left of the canvas in
// CSS pixels. Cesium exposes cartesianToCanvasCoordinates() specifically for
// mapping world positions into the same canvas screen space. Comparing those
// two spaces directly avoids the mobile/high-DPI window-coordinate ambiguity.
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

// Install on the prototype before the Viewer/Scene is constructed. The touch
// bridge can therefore resolve a target on the very first tap; it no longer
// depends on a previous render() call to initialize per-scene state.
if (!Cesium.Scene.prototype[RESOLVER_FLAG]) {
  Cesium.Scene.prototype.__gevResolveProjectedTarget = function resolveGevProjectedTarget(canvasX, canvasY) {
    return resolveProjectedTarget(this, canvasX, canvasY);
  };
  Cesium.Scene.prototype[RESOLVER_FLAG] = true;
}

console.info('[GEV] Screen-space target resolver ready');
