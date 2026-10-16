import * as Cesium from 'cesium';

const PATCH_FLAG = '__gevScreenTargetResolverPatched';
const SET_ACTION_FLAG = '__gevScreenTargetActionPatched';
const ENTITY_REGISTRY = new Set();
const DEFAULT_RADIUS_PX = 34;
const SATELLITE_RADIUS_PX = 44;
const AIRCRAFT_RADIUS_PX = 36;
const GROUND_RADIUS_PX = 30;
const OCCLUSION_ALTITUDE_M = 50_000;
const OCCLUSION_TOLERANCE_M = 5_000;

function isGevEntity(entity) {
  return entity instanceof Cesium.Entity && Boolean(entity.gevMeta) && entity.show !== false && entity.isShowing !== false;
}

function registerEntity(entity) {
  if (entity instanceof Cesium.Entity) ENTITY_REGISTRY.add(entity);
  return entity;
}

function unregisterEntity(entity) {
  ENTITY_REGISTRY.delete(entity);
}

function cleanupRegistry() {
  for (const entity of ENTITY_REGISTRY) {
    if (!entity?.entityCollection || entity.entityCollection.contains?.(entity) === false) {
      ENTITY_REGISTRY.delete(entity);
    }
  }
}

function targetRadius(entity) {
  switch (entity.gevMeta?.type) {
    case 'SATELLITE':
      return SATELLITE_RADIUS_PX;
    case 'AIRCRAFT':
      return AIRCRAFT_RADIUS_PX;
    case 'EARTHQUAKE':
      return GROUND_RADIUS_PX;
    default:
      return DEFAULT_RADIUS_PX;
  }
}

function isOccludedByGlobe(scene, windowPosition, targetPosition, altitude) {
  if (!Number.isFinite(altitude) || altitude < OCCLUSION_ALTITUDE_M) return false;

  const ray = scene.camera.getPickRay(windowPosition);
  if (!ray) return false;

  const surface = scene.globe?.pick(ray, scene);
  if (!Cesium.defined(surface)) return false;

  const cameraPosition = scene.camera.positionWC;
  const targetDistance = Cesium.Cartesian3.distance(cameraPosition, targetPosition);
  const surfaceDistance = Cesium.Cartesian3.distance(cameraPosition, surface);

  return surfaceDistance + OCCLUSION_TOLERANCE_M < targetDistance;
}

function resolveProjectedTarget(scene, windowPosition) {
  if (!scene || !Cesium.defined(windowPosition)) return undefined;

  cleanupRegistry();

  let best;
  let bestDistance = Number.POSITIVE_INFINITY;
  const now = Cesium.JulianDate.now();
  const projected = new Cesium.Cartesian2();

  for (const entity of ENTITY_REGISTRY) {
    if (!isGevEntity(entity) || !entity.position) continue;

    let worldPosition;
    try {
      worldPosition = entity.position.getValue(now);
    } catch {
      continue;
    }
    if (!Cesium.defined(worldPosition)) continue;

    const screenPosition = Cesium.SceneTransforms.worldToWindowCoordinates(scene, worldPosition, projected);
    if (!Cesium.defined(screenPosition)) continue;

    const dx = screenPosition.x - windowPosition.x;
    const dy = screenPosition.y - windowPosition.y;
    const distance = Math.hypot(dx, dy);
    const radius = targetRadius(entity);
    if (distance > radius || distance >= bestDistance) continue;

    const altitude = Number(entity.gevMeta?.altitude);
    if (isOccludedByGlobe(scene, screenPosition, worldPosition, altitude)) continue;

    best = entity;
    bestDistance = distance;
  }

  return best;
}

const originalPick = Cesium.Scene.prototype.pick;
if (originalPick && !originalPick[PATCH_FLAG]) {
  const projectedPick = function projectedTargetPick(windowPosition, width, height) {
    const picked = originalPick.call(this, windowPosition, width, height);
    if (Cesium.defined(picked)) {
      const pickedId = Cesium.defaultValue(picked.id, picked.primitive?.id);
      if (pickedId instanceof Cesium.Entity && pickedId.gevMeta) return picked;
    }

    if (this.__gevResolveProjectedPick && this.__gevProjectedPickPosition === windowPosition) {
      const entity = resolveProjectedTarget(this, windowPosition);
      if (entity) return { id: entity, primitive: entity };
    }

    return picked;
  };

  projectedPick[PATCH_FLAG] = true;
  projectedPick.__gevOriginalPick = originalPick;
  Cesium.Scene.prototype.pick = projectedPick;
}

const originalSetInputAction = Cesium.ScreenSpaceEventHandler.prototype.setInputAction;
if (originalSetInputAction && !originalSetInputAction[SET_ACTION_FLAG]) {
  const wrappedSetInputAction = function wrappedSetInputAction(action, type, modifier) {
    if (type !== Cesium.ScreenSpaceEventType.LEFT_CLICK || modifier !== undefined || typeof action !== 'function') {
      return originalSetInputAction.call(this, action, type, modifier);
    }

    const wrappedAction = function projectedTargetAction(movement) {
      const scene = this._element?.__gevScene;
      if (!scene || !movement?.position) return action.call(this, movement);

      scene.__gevResolveProjectedPick = true;
      scene.__gevProjectedPickPosition = movement.position;
      try {
        return action.call(this, movement);
      } finally {
        scene.__gevProjectedPickPosition = undefined;
        scene.__gevResolveProjectedPick = false;
      }
    };

    wrappedAction.__gevOriginalAction = action;
    return originalSetInputAction.call(this, wrappedAction, type, modifier);
  };

  wrappedSetInputAction[SET_ACTION_FLAG] = true;
  Cesium.ScreenSpaceEventHandler.prototype.setInputAction = wrappedSetInputAction;
}

const originalAdd = Cesium.EntityCollection.prototype.add;
const originalRemove = Cesium.EntityCollection.prototype.remove;
const originalRemoveAll = Cesium.EntityCollection.prototype.removeAll;

if (!originalAdd.__gevRegistryPatched) {
  const patchedAdd = function patchedEntityAdd(entity) {
    const added = originalAdd.call(this, entity);
    registerEntity(added);
    return added;
  };
  patchedAdd.__gevRegistryPatched = true;
  Cesium.EntityCollection.prototype.add = patchedAdd;
}

if (!originalRemove.__gevRegistryPatched) {
  const patchedRemove = function patchedEntityRemove(entity) {
    unregisterEntity(entity);
    return originalRemove.call(this, entity);
  };
  patchedRemove.__gevRegistryPatched = true;
  Cesium.EntityCollection.prototype.remove = patchedRemove;
}

if (!originalRemoveAll.__gevRegistryPatched) {
  const patchedRemoveAll = function patchedEntityRemoveAll() {
    for (const entity of this.values) unregisterEntity(entity);
    return originalRemoveAll.call(this);
  };
  patchedRemoveAll.__gevRegistryPatched = true;
  Cesium.EntityCollection.prototype.removeAll = patchedRemoveAll;
}

console.info('[GEV] Screen-space target resolver ready');
