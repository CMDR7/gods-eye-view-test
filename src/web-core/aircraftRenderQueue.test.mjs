import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AIRCRAFT_RENDER_BATCH_SIZE,
  MAX_AIRCRAFT_RENDER_COUNT,
  renderAircraftInBatches,
} from './aircraftRenderQueue.js';

function createCollection() {
  let suspended = false;
  let pendingAdds = 0;
  const batchSizes = [];

  return {
    batchSizes,
    get suspended() {
      return suspended;
    },
    recordAdd() {
      assert.equal(suspended, true);
      pendingAdds += 1;
    },
    suspendEvents() {
      assert.equal(suspended, false);
      suspended = true;
      pendingAdds = 0;
    },
    resumeEvents() {
      assert.equal(suspended, true);
      suspended = false;
      if (pendingAdds > 0) batchSizes.push(pendingAdds);
      pendingAdds = 0;
    },
  };
}

test('aircraft entity changes are coalesced into bounded batches', async () => {
  const collection = createCollection();
  const items = Array.from({ length: 45 }, (_, index) => index);
  const rendered = [];
  let yields = 0;

  const count = await renderAircraftInBatches({
    collection,
    aircraft: items,
    renderItem(item) {
      rendered.push(item);
      collection.recordAdd();
    },
    yieldControl: async () => {
      yields += 1;
    },
  });

  assert.equal(count, 45);
  assert.deepEqual(rendered, items);
  assert.deepEqual(collection.batchSizes, [20, 20, 5]);
  assert.equal(AIRCRAFT_RENDER_BATCH_SIZE, 20);
  assert.equal(yields, 2);
  assert.equal(collection.suspended, false);
});

test('aircraft rendering is capped at 100 contacts on mobile', async () => {
  const collection = createCollection();
  const items = Array.from({ length: 260 }, (_, index) => index);
  const rendered = [];

  const count = await renderAircraftInBatches({
    collection,
    aircraft: items,
    renderItem(item) {
      rendered.push(item);
      collection.recordAdd();
    },
    yieldControl: async () => {},
  });

  assert.equal(MAX_AIRCRAFT_RENDER_COUNT, 100);
  assert.equal(count, 100);
  assert.equal(rendered.length, 100);
  assert.deepEqual(rendered, items.slice(0, 100));
  assert.deepEqual(collection.batchSizes, [20, 20, 20, 20, 20]);
  assert.equal(collection.suspended, false);
});

test('aircraft rendering stops between batches when its request becomes stale', async () => {
  const collection = createCollection();
  const rendered = [];
  let current = true;

  const count = await renderAircraftInBatches({
    collection,
    aircraft: Array.from({ length: 60 }, (_, index) => index),
    renderItem(item) {
      rendered.push(item);
      collection.recordAdd();
    },
    isCurrent: () => current,
    yieldControl: async () => {
      current = false;
    },
  });

  assert.equal(count, 20);
  assert.equal(rendered.length, 20);
  assert.deepEqual(collection.batchSizes, [20]);
  assert.equal(collection.suspended, false);
});

test('aircraft collection events resume when rendering fails', async () => {
  const collection = createCollection();

  await assert.rejects(
    renderAircraftInBatches({
      collection,
      aircraft: [1, 2, 3],
      renderItem(item) {
        collection.recordAdd();
        if (item === 2) throw new Error('render failed');
      },
      yieldControl: async () => {},
    }),
    /render failed/,
  );

  assert.equal(collection.suspended, false);
  assert.deepEqual(collection.batchSizes, [2]);
});
