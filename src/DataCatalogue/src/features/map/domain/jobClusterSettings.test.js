import assert from "node:assert/strict";
import test from "node:test";

import {
  JOB_CLUSTER_PRESET,
  JOB_CLUSTER_STYLE,
  createDefaultJobClusterSettings,
  getJobClusterPresetConfig,
  getJobClusterSettingSummary,
  normalizeJobClusterSettings,
} from "./jobClusterSettings.js";

test("createDefaultJobClusterSettings uses medium count clustering", () => {
  assert.deepEqual(createDefaultJobClusterSettings(), {
    preset: JOB_CLUSTER_PRESET.MEDIUM,
    style: JOB_CLUSTER_STYLE.COUNT,
  });
});

test("normalizeJobClusterSettings rejects invalid preset and style values", () => {
  assert.deepEqual(
    normalizeJobClusterSettings({
      preset: "very-large",
      style: "bad-style",
    }),
    {
      preset: JOB_CLUSTER_PRESET.MEDIUM,
      style: JOB_CLUSTER_STYLE.COUNT,
    }
  );

  assert.deepEqual(normalizeJobClusterSettings(null), {
    preset: JOB_CLUSTER_PRESET.MEDIUM,
    style: JOB_CLUSTER_STYLE.COUNT,
  });
});

test("getJobClusterPresetConfig returns null when clustering is off", () => {
  assert.equal(
    getJobClusterPresetConfig({
      preset: JOB_CLUSTER_PRESET.OFF,
    }),
    null
  );
});

test("getJobClusterPresetConfig returns Esri-style basic config for medium", () => {
  assert.deepEqual(
    getJobClusterPresetConfig({
      preset: JOB_CLUSTER_PRESET.MEDIUM,
    }),
    {
      clusterMinSize: 16.5,
    }
  );
});

test("getJobClusterPresetConfig returns radius settings for small and large presets", () => {
  assert.deepEqual(
    getJobClusterPresetConfig({
      preset: JOB_CLUSTER_PRESET.SMALL,
    }),
    {
      clusterRadius: "40px",
      clusterMinSize: 16.5,
    }
  );

  assert.deepEqual(
    getJobClusterPresetConfig({
      preset: JOB_CLUSTER_PRESET.LARGE,
    }),
    {
      clusterRadius: "100px",
      clusterMinSize: 16.5,
    }
  );
});

test("getJobClusterSettingSummary describes selected clustering settings", () => {
  assert.equal(
    getJobClusterSettingSummary({
      preset: JOB_CLUSTER_PRESET.SMALL,
      style: JOB_CLUSTER_STYLE.PRIORITY_PIE,
    }),
    "Radius: Small; Style: Priority pie"
  );
});
