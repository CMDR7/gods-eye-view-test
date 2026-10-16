import * as Cesium from 'cesium';

const DEFAULT_PICK_SIZE = 25;
const PATCH_FLAG = '__gevMobilePickPatched';

const originalPick = Cesium.Scene.prototype.pick;
const originalDrillPick = Cesium.Scene.prototype.drillPick;

if (!originalPick[PATCH_FLAG]) {
  const expandedPick = function pickWithTouchTarget(windowPosition, width, height) {
    const pickWidth = width === undefined ? DEFAULT_PICK_SIZE : width;
    const pickHeight = height === undefined ? DEFAULT_PICK_SIZE : height;
    const picked = originalPick.call(this, windowPosition, pickWidth, pickHeight);

    // A point entity can lose the top-most pick to another rendered primitive.
    // Search the same touch target for an Entity before giving up.
    if (Cesium.defined(picked)) {
      const pickedId = Cesium.defaultValue(picked.id, picked.primitive?.id);
      if (pickedId instanceof Cesium.Entity && pickedId.gevMeta) return picked;
    }

    const candidates = originalDrillPick.call(this, windowPosition, 20, pickWidth, pickHeight);
    for (const candidate of candidates) {
      const id = Cesium.defaultValue(candidate?.id, candidate?.primitive?.id);
      if (id instanceof Cesium.Entity && id.gevMeta) return candidate;
    }

    return picked;
  };

  expandedPick[PATCH_FLAG] = true;
  expandedPick.__gevOriginalPick = originalPick;
  Cesium.Scene.prototype.pick = expandedPick;
}
