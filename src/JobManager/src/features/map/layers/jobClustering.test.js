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
  assert.equal(featureReduction.popupTemplate.title, "{cluster_count} Jobs in this cluster");
  assert.equal(featureReduction.popupTemplate.actions.length, 0);
  assert.equal(featureReduction.popupTemplate.content.length, 1);
  assert.deepEqual(featureReduction.labelingInfo, [
    {
      deconflictionStrategy: "none",
      labelExpressionInfo: {
        expression: "Text($feature.cluster_count, '#,###')",
      },
      labelPlacement: "center-center",
      symbol: {
        type: "text",
        color: "white",
        font: {
          family: "Noto Sans",
          size: "12px",
        },
      },
    },
  ]);
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

test("createJobClusterPopupTemplate exposes compact picker content and cluster count formatting", () => {
  const popupTemplate = createJobClusterPopupTemplate();

  assert.equal(popupTemplate.title, "{cluster_count} Jobs in this cluster");
  assert.equal(popupTemplate.actions.length, 0);
  assert.equal(popupTemplate.content.length, 1);
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
