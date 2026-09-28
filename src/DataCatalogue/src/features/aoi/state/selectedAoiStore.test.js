import assert from "node:assert/strict";
import test from "node:test";

import { createSelectedAoiStore } from "./selectedAoiStore.js";

test("selected AOI store normalizes and exposes selected AOI snapshots", () => {
  const store = createSelectedAoiStore();
  const snapshots = [];

  const unsubscribe = store.subscribe((snapshot) => {
    snapshots.push(snapshot);
  });

  const selectedAoi = store.selectAoi({
    id: "{AOI-GLOBAL-ID}",
    name: "Test AOI",
    objectId: 17,
  });

  assert.deepEqual(selectedAoi, {
    aoiId: "{AOI-GLOBAL-ID}",
    aoiName: "Test AOI",
    objectId: "17",
  });
  assert.deepEqual(store.getSnapshot().selectedAoi, selectedAoi);

  store.clearSelection();

  assert.equal(store.getSnapshot().selectedAoi, null);
  assert.equal(snapshots.length, 3);

  unsubscribe();
});
