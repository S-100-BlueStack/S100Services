import assert from "node:assert/strict";
import test from "node:test";

import { JOB_CLUSTER_PRESET } from "../domain/jobClusterSettings.js";
import { createJobClusterSettingsStore } from "./jobClusterSettingsStore.js";

test("createJobClusterSettingsStore stores and resets clustering settings", () => {
  const store = createJobClusterSettingsStore();
  const snapshots = [];

  const unsubscribe = store.subscribe((snapshot) => {
    snapshots.push(snapshot);
  });

  store.setSettings({
    preset: JOB_CLUSTER_PRESET.LARGE,
  });

  assert.deepEqual(store.getSnapshot().settings, {
    preset: JOB_CLUSTER_PRESET.LARGE,
  });

  store.resetSettings();

  assert.deepEqual(store.getSnapshot().settings, {
    preset: JOB_CLUSTER_PRESET.MEDIUM,
  });
  assert.equal(snapshots.length, 3);

  unsubscribe();
});

test("createJobClusterSettingsStore normalizes invalid presets", () => {
  const store = createJobClusterSettingsStore();

  store.setSettings({
    preset: "bad-value",
  });

  assert.deepEqual(store.getSnapshot().settings, {
    preset: JOB_CLUSTER_PRESET.MEDIUM,
  });
});
