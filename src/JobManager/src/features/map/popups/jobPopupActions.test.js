import assert from "node:assert/strict";
import test from "node:test";

import { JOB_LAYER_FIELD } from "../layers/jobLayerFeatureData.js";
import { createJobSelectionFromGraphic } from "./jobPopupActions.js";

test("createJobSelectionFromGraphic extracts selected Job values from popup graphic", () => {
  const selectedJob = createJobSelectionFromGraphic({
    attributes: {
      [JOB_LAYER_FIELD.OBJECT_ID]: 14,
      [JOB_LAYER_FIELD.JOB_ID]: "job-001",
      [JOB_LAYER_FIELD.TITLE]: "Review harbour update",
      [JOB_LAYER_FIELD.GEOMETRY_TYPE]: "polygon",
    },
  });

  assert.deepEqual(selectedJob, {
    jobId: "job-001",
    jobTitle: "Review harbour update",
    objectId: 14,
    geometryType: "polygon",
  });
});

test("createJobSelectionFromGraphic uses fallback title for missing title", () => {
  const selectedJob = createJobSelectionFromGraphic({
    attributes: {
      [JOB_LAYER_FIELD.OBJECT_ID]: 2,
      [JOB_LAYER_FIELD.JOB_ID]: "job-002",
      [JOB_LAYER_FIELD.GEOMETRY_TYPE]: "point",
    },
  });

  assert.deepEqual(selectedJob, {
    jobId: "job-002",
    jobTitle: "Selected Job",
    objectId: 2,
    geometryType: "point",
  });
});
