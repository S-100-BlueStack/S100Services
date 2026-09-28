import assert from "node:assert/strict";
import test from "node:test";

import { JOB_CLUSTER_PRESET, JOB_CLUSTER_STYLE } from "../domain/jobClusterSettings.js";
import { createJobClusterSettingsStore } from "./jobClusterSettingsStore.js";

test("createJobClusterSettingsStore stores and resets clustering settings", () => {
  const store = createJobClusterSettingsStore();
  const snapshots = [];

  const unsubscribe = store.subscribe((snapshot) => {
    snapshots.push(snapshot);
  });

  store.setSettings({
    preset: JOB_CLUSTER_PRESET.LARGE,
    style: JOB_CLUSTER_STYLE.PRIORITY_PIE,
  });

  assert.deepEqual(store.getSnapshot().settings, {
    preset: JOB_CLUSTER_PRESET.LARGE,
    style: JOB_CLUSTER_STYLE.PRIORITY_PIE,
  });

  store.resetSettings();

  assert.deepEqual(store.getSnapshot().settings, {
    preset: JOB_CLUSTER_PRESET.MEDIUM,
    style: JOB_CLUSTER_STYLE.COUNT,
  });
  assert.equal(snapshots.length, 3);

  unsubscribe();
});

test("createJobClusterSettingsStore normalizes invalid presets and styles", () => {
  const store = createJobClusterSettingsStore();

  store.setSettings({
    preset: "bad-value",
    style: "bad-style",
  });

  assert.deepEqual(store.getSnapshot().settings, {
    preset: JOB_CLUSTER_PRESET.MEDIUM,
    style: JOB_CLUSTER_STYLE.COUNT,
  });
});

test("createJobClusterSettingsStore preserves existing style when only preset changes", () => {
  const store = createJobClusterSettingsStore({
    preset: JOB_CLUSTER_PRESET.MEDIUM,
    style: JOB_CLUSTER_STYLE.PRIORITY_GROUPS,
  });

  store.setSettings({
    preset: JOB_CLUSTER_PRESET.SMALL,
  });

  assert.deepEqual(store.getSnapshot().settings, {
    preset: JOB_CLUSTER_PRESET.SMALL,
    style: JOB_CLUSTER_STYLE.PRIORITY_GROUPS,
  });
});
