import assert from "node:assert/strict";
import test from "node:test";

import { createJobFilterStore } from "./jobFilterStore.js";

test("createJobFilterStore stores, normalizes and clears filters", () => {
  const store = createJobFilterStore();
  const snapshots = [];

  const unsubscribe = store.subscribe((snapshot) => {
    snapshots.push(snapshot);
  });

  store.setFilters({
    activeOnly: true,
    statusValues: ["todo", "bad-value"],
  });

  assert.deepEqual(store.getSnapshot().filters, {
    activeOnly: true,
    highPriorityOnly: false,
    withRelatedAoisOnly: false,
    statusValues: ["todo"],
    priorityValues: [],
  });

  store.clearFilters();

  assert.equal(store.getSnapshot().filters.activeOnly, false);
  assert.deepEqual(store.getSnapshot().filters.statusValues, []);
  assert.equal(snapshots.length, 3);

  unsubscribe();
});
