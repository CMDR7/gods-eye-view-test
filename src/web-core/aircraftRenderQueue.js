export const MAX_AIRCRAFT_RENDER_COUNT = 100;
export const AIRCRAFT_RENDER_BATCH_SIZE = 20;

function yieldToRenderLoop() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/**
 * Bound aircraft entity creation and coalesce Cesium collection events.
 * Presentation listeners rescan the aircraft collections on collectionChanged,
 * so emitting one event per contact turns large snapshots into quadratic work.
 */
export async function renderAircraftInBatches({
  collection,
  aircraft,
  renderItem,
  isCurrent = () => true,
  yieldControl = yieldToRenderLoop,
}) {
  if (
    !collection ||
    typeof collection.suspendEvents !== 'function' ||
    typeof collection.resumeEvents !== 'function'
  ) {
    throw new TypeError('A Cesium EntityCollection is required');
  }
  if (!Array.isArray(aircraft)) {
    throw new TypeError('An aircraft snapshot array is required');
  }
  if (typeof renderItem !== 'function') {
    throw new TypeError('An aircraft renderer callback is required');
  }

  const admitted = aircraft.slice(0, MAX_AIRCRAFT_RENDER_COUNT);
  let rendered = 0;

  for (
    let offset = 0;
    offset < admitted.length;
    offset += AIRCRAFT_RENDER_BATCH_SIZE
  ) {
    if (!isCurrent()) break;

    const end = Math.min(
      offset + AIRCRAFT_RENDER_BATCH_SIZE,
      admitted.length,
    );
    collection.suspendEvents();
    try {
      for (let index = offset; index < end; index += 1) {
        renderItem(admitted[index], index);
        rendered += 1;
      }
    } finally {
      collection.resumeEvents();
    }

    if (rendered === end && end < admitted.length) {
      await yieldControl();
    }
  }

  return rendered;
}
