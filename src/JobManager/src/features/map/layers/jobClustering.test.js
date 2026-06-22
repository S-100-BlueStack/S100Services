import assert from "node:assert/strict";
import test from "node:test";

import { JOB_CLUSTER_PRESET } from "../domain/jobClusterSettings.js";
import {
  createCountJobPointFeatureReduction,
  createJobClusterPopupTemplate,
} from "./jobClustering.js";

test("createCountJobPointFeatureReduction creates Esri-style medium point clustering config by default", () => {
  const featureReduction = createCountJobPointFeatureReduction();

  assert.equal(featureReduction.type, "cluster");
  assert.equal(featureReduction.clusterRadius, undefined);
  assert.equal(featureReduction.clusterMinSize, 16.5);
  assert.equal(featureReduction.clusterMaxSize, undefined);
  assert.equal(featureReduction.labelingInfo.length, 1);
  assert.equal(featureReduction.popupTemplate.title, "Job cluster");
});

test("createCountJobPointFeatureReduction supports small clustering preset", () => {
  const featureReduction = createCountJobPointFeatureReduction({
    preset: JOB_CLUSTER_PRESET.SMALL,
  });

  assert.equal(featureReduction.clusterRadius, "40px");
  assert.equal(featureReduction.clusterMinSize, 16.5);
});

test("createCountJobPointFeatureReduction supports large clustering preset", () => {
  const featureReduction = createCountJobPointFeatureReduction({
    preset: JOB_CLUSTER_PRESET.LARGE,
  });

  assert.equal(featureReduction.clusterRadius, "100px");
  assert.equal(featureReduction.clusterMinSize, 16.5);
});

test("createCountJobPointFeatureReduction returns null when clustering is off", () => {
  assert.equal(
    createCountJobPointFeatureReduction({
      preset: JOB_CLUSTER_PRESET.OFF,
    }),
    null
  );
});

test("createJobClusterPopupTemplate exposes cluster count field formatting", () => {
  const popupTemplate = createJobClusterPopupTemplate();

  assert.equal(
    popupTemplate.content,
    "This cluster contains {cluster_count} Jobs. Zoom in to inspect individual Jobs."
  );
  assert.deepEqual(popupTemplate.fieldInfos, [
    {
      fieldName: "cluster_count",
      label: "Jobs",
      format: {
        places: 0,
        digitSeparator: true,
      },
    },
  ]);
});
