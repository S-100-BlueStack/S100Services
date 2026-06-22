import assert from "node:assert/strict";
import test from "node:test";

import { createJobClusterPopupTemplate, createJobPointFeatureReduction } from "./jobClustering.js";

test("createJobPointFeatureReduction creates point clustering config", () => {
  const featureReduction = createJobPointFeatureReduction();

  assert.equal(featureReduction.type, "cluster");
  assert.equal(featureReduction.clusterRadius, "128px");
  assert.equal(featureReduction.clusterMinSize, "26px");
  assert.equal(featureReduction.clusterMaxSize, "48px");
  assert.equal(featureReduction.labelingInfo.length, 1);
  assert.equal(featureReduction.popupTemplate.title, "Job cluster");
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
