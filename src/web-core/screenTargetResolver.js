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

function angularToleranceRadians(scene, radiusPx) {
  const canvasHeight = scene.canvas?.clientHeight || 0;
  const fovy = scene.camera.frustum?.fovy;
  if (!canvasHeight || !Number.isFinite(fovy) || fovy <= 0) return Cesium.Math.toRadians(1.0);
  const focalPixels = (canvasHeight * 0.5) / Math.tan(fovy * 0.5);
  return Math.atan(radiusPx / Math.max(focalPixels, 1));
}

// Resolve the tap against the actual camera ray instead of converting between
// CSS pixels, drawing-buffer pixels, and Cesium window coordinates. The same
// windowPosition already used by globe.pick() is used to construct the ray,
// then every GEV entity is tested by angular separation from that ray. This is
// particularly reliable for satellites because their world positions are
// thousands of kilometres above the ellipsoid and are not surface points.
function resolveProjectedTarget(scene, windowPosition) {
  if (!scene || !Cesium.defined(windowPosition)) return undefined;

  const ray = scene.camera.getPickRay(windowPosition);
  if (!ray) return undefined;

  let best;
  let bestAngle = Number.POSITIVE_INFINITY;
  const toTarget = new Cesium.Cartesian3();
  const direction = new Cesium.Cartesian3();

  for (const entity of getGevEntities(scene)) {
    let worldPosition;
    try {
      worldPosition = entity.position.getValue(Cesium.JulianDate.now());
    } catch {
      continue;
    }
    if (!Cesium.defined(worldPosition)) continue;

    Cesium.Cartesian3.subtract(worldPosition, ray.origin, toTarget);
    const distance = Cesium.Cartesian3.magnitude(toTarget);
    if (!Number.isFinite(distance) || distance <= 0) continue;

    Cesium.Cartesian3.normalize(toTarget, direction);
    const cosine = Cesium.Math.clamp(Cesium.Cartesian3.dot(direction, ray.direction), -1, 1);
    const angle = Math.acos(cosine);
    if (!Number.isFinite(angle)) continue;

    const tolerance = angularToleranceRadians(scene, targetRadius(entity));
    if (angle > tolerance || angle >= bestAngle) continue;

    best = entity;
    bestAngle = angle;
  }

  return best;
}

// Install before the Viewer/Scene is constructed so the touch bridge can use
// the resolver on the first possible tap.
if (!Cesium.Scene.prototype[RESOLVER_FLAG]) {
  Cesium.Scene.prototype.__gevResolveProjectedTarget = function resolveGevProjectedTarget(windowPosition) {
    return resolveProjectedTarget(this, windowPosition);
  };
  Cesium.Scene.prototype[RESOLVER_FLAG] = true;
}

console.info('[GEV] Ray-space target resolver ready');
