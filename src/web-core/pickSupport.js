import * as Cesium from 'cesium';

const DEFAULT_PICK_SIZE = 15;
const PATCH_FLAG = '__gevMobilePickPatched';

const originalPick = Cesium.Scene.prototype.pick;

if (!originalPick[PATCH_FLAG]) {
  const expandedPick = function pickWithTouchTarget(windowPosition, width, height) {
    const pickWidth = width === undefined ? DEFAULT_PICK_SIZE : width;
    const pickHeight = height === undefined ? DEFAULT_PICK_SIZE : height;
    return originalPick.call(this, windowPosition, pickWidth, pickHeight);
  };

  expandedPick[PATCH_FLAG] = true;
  expandedPick.__gevOriginalPick = originalPick;
  Cesium.Scene.prototype.pick = expandedPick;
}
