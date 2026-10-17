import * as Cesium from 'cesium';

const DEFAULT_PICK_SIZE = 25;
const TOUCH_TAP_TOLERANCE = 14;
const TOUCH_BRIDGE_FLAG = '__gevTouchBridgeInstalled';
const RENDER_PATCH_FLAG = '__gevSceneCapturePatched';

function resolvePickedEntity(picked) {
  if (!Cesium.defined(picked)) return undefined;
  const pickedId = Cesium.defaultValue(picked.id, picked.primitive?.id);
  return pickedId instanceof Cesium.Entity && pickedId.gevMeta ? pickedId : undefined;
}

function nativePick(scene, windowPosition) {
  const screenSatellite = scene.__gevPickNativeSatellite?.(windowPosition);
  if (screenSatellite?.gevMeta) return { entity: screenSatellite, source: 'NATIVE_SCREEN' };

  const picked = scene.pick(windowPosition, DEFAULT_PICK_SIZE, DEFAULT_PICK_SIZE);
  const entity = resolvePickedEntity(picked);
  if (entity) return { entity, source: 'NATIVE' };

  const candidates = scene.drillPick(windowPosition, DEFAULT_PICK_SIZE, DEFAULT_PICK_SIZE);
  for (const candidate of candidates) {
    const entityFromCandidate = resolvePickedEntity(candidate);
    if (entityFromCandidate) return { entity: entityFromCandidate, source: 'NATIVE_DRILL' };
  }

  return undefined;
}

function projectedPick(scene, windowPosition) {
  const airport = scene.__gevResolveAirportTarget?.(windowPosition);
  if (airport?.gevMeta) return { entity: airport, source: 'AIRPORT_SCREEN' };

  const entity = scene.__gevResolveProjectedTarget?.(windowPosition);
  return entity ? { entity, source: 'PROJECTED' } : undefined;
}

function findGevEntity(scene, primaryPosition, alternatePosition) {
  const positions = [primaryPosition];
  if (alternatePosition && (alternatePosition.x !== primaryPosition.x || alternatePosition.y !== primaryPosition.y)) {
    positions.push(alternatePosition);
  }

  for (const position of positions) {
    const native = nativePick(scene, position);
    if (native) return native;
  }

  for (const position of positions) {
    const projected = projectedPick(scene, position);
    if (projected) return projected;
  }

  return undefined;
}

function showTouchFocus(clientX, clientY, message) {
  let focus = document.getElementById('gevTouchFocus');
  if (!focus) {
    focus = document.createElement('div');
    focus.id = 'gevTouchFocus';
    Object.assign(focus.style, {
      position: 'fixed', width: '54px', height: '54px',
      border: '1px solid rgba(90, 235, 255, 0.9)', borderRadius: '50%',
      boxShadow: '0 0 14px rgba(70, 220, 255, 0.65), inset 0 0 10px rgba(70, 220, 255, 0.2)',
      transform: 'translate(-50%, -50%) scale(0.72)', pointerEvents: 'none', zIndex: '9999',
      opacity: '0', transition: 'opacity 120ms ease, transform 180ms ease',
    });
    document.body.appendChild(focus);
  }
  focus.style.left = `${clientX}px`;
  focus.style.top = `${clientY}px`;
  focus.style.opacity = '1';
  focus.style.transform = 'translate(-50%, -50%) scale(1)';
  window.clearTimeout(focus._gevTimer);
  focus._gevTimer = window.setTimeout(() => {
    focus.style.opacity = '0';
    focus.style.transform = 'translate(-50%, -50%) scale(1.15)';
  }, 850);
  if (message) {
    const status = document.getElementById('status');
    if (status) {
      status.textContent = message;
      status.dataset.type = 'ok';
    }
  }
}

function formatGroundPosition(scene, windowPosition) {
  const ray = scene.camera.getPickRay(windowPosition);
  if (!ray) return null;
  let cartesian = scene.globe.pick(ray, scene);
  if (!Cesium.defined(cartesian)) cartesian = scene.camera.pickEllipsoid(windowPosition, scene.globe.ellipsoid);
  if (!Cesium.defined(cartesian)) return null;
  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  const lat = Cesium.Math.toDegrees(cartographic.latitude);
  const lon = Cesium.Math.toDegrees(cartographic.longitude);
  const height = Math.max(0, cartographic.height);
  return `GROUND FOCUS // ${lat.toFixed(5)}° ${lat >= 0 ? 'N' : 'S'} // ${Math.abs(lon).toFixed(5)}° ${lon >= 0 ? 'E' : 'W'} // ${height.toFixed(0)} M`;
}

function installTouchBridge(handler) {
  if (!handler || handler[TOUCH_BRIDGE_FLAG]) return;
  const element = handler._element;
  if (!element || !element.addEventListener) return;
  handler[TOUCH_BRIDGE_FLAG] = true;
  let startX = 0;
  let startY = 0;
  let pointerId = null;
  let moved = false;
  element.style.touchAction = 'none';

  element.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if (event.isPrimary === false) return;
    startX = event.clientX;
    startY = event.clientY;
    pointerId = event.pointerId;
    moved = false;
  }, { passive: true });

  element.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > TOUCH_TAP_TOLERANCE) moved = true;
  }, { passive: true });

  element.addEventListener('pointerup', (event) => {
    if (event.pointerId !== pointerId) return;
    const wasTap = !moved && Math.hypot(event.clientX - startX, event.clientY - startY) <= TOUCH_TAP_TOLERANCE;
    pointerId = null;
    if (!wasTap) return;

    const rect = element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const height = rect.height || element.clientHeight || 0;

    // Cesium screen/window coordinates are top-left origin: x grows right,
    // y grows down. The previous bridge inverted y and relied on a secondary
    // fallback, which made touch selection dependent on the consumer's own
    // coordinate handling.
    const primaryPosition = new Cesium.Cartesian2(x, y);
    const alternatePosition = new Cesium.Cartesian2(x, height - y);
    const scene = element.__gevScene;
    if (!scene) return;

    const result = findGevEntity(scene, primaryPosition, alternatePosition);
    const entity = result?.entity;
    if (entity) {
      showTouchFocus(event.clientX, event.clientY, `${result.source} TARGET // ${entity.gevMeta?.type || 'GEV'}`);
    } else {
      showTouchFocus(event.clientX, event.clientY);
    }

    const action = handler.getInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
    if (typeof action === 'function') {
      action({ position: primaryPosition, __gevTarget: entity, __gevTargetSource: result?.source });
    }

    if (!entity) {
      const groundMessage = formatGroundPosition(scene, primaryPosition);
      if (groundMessage) showTouchFocus(event.clientX, event.clientY, groundMessage);
    }
  }, { passive: true });
}

const originalRender = Cesium.Scene.prototype.render;
if (originalRender && !originalRender[RENDER_PATCH_FLAG]) {
  const patchedRender = function captureScene(time) {
    if (this.canvas) this.canvas.__gevScene = this;
    return originalRender.call(this, time);
  };
  patchedRender[RENDER_PATCH_FLAG] = true;
  Cesium.Scene.prototype.render = patchedRender;
}

const originalSetInputAction = Cesium.ScreenSpaceEventHandler.prototype.setInputAction;
const SET_ACTION_PATCH_FLAG = '__gevTouchSetInputPatched';
if (!originalSetInputAction[SET_ACTION_PATCH_FLAG]) {
  const patchedSetInputAction = function patchedSetInputAction(action, type, modifier) {
    const result = originalSetInputAction.call(this, action, type, modifier);
    if (type === Cesium.ScreenSpaceEventType.LEFT_CLICK && modifier === undefined) installTouchBridge(this);
    return result;
  };
  patchedSetInputAction[SET_ACTION_PATCH_FLAG] = true;
  Cesium.ScreenSpaceEventHandler.prototype.setInputAction = patchedSetInputAction;
}
