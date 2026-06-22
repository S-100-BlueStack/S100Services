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
    relatedAoiIds: [],
  });
});

test("createJobSelectionFromGraphic extracts related AOI ids from serialized popup attributes", () => {
  const selectedJob = createJobSelectionFromGraphic({
    attributes: {
      [JOB_LAYER_FIELD.OBJECT_ID]: 14,
      [JOB_LAYER_FIELD.JOB_ID]: "job-001",
      [JOB_LAYER_FIELD.TITLE]: "Review harbour update",
      [JOB_LAYER_FIELD.GEOMETRY_TYPE]: "polygon",
      [JOB_LAYER_FIELD.RELATED_AOI_IDS]: '["{AOI-1}","{AOI-2}"]',
    },
  });

  assert.deepEqual(selectedJob, {
    jobId: "job-001",
    jobTitle: "Review harbour update",
    objectId: 14,
    geometryType: "polygon",
    relatedAoiIds: ["{AOI-1}", "{AOI-2}"],
  });
});

test("createJobSelectionFromGraphic falls back to graphic geometry type", () => {
  const selectedJob = createJobSelectionFromGraphic({
    geometry: {
      type: "point",
    },
    attributes: {
      [JOB_LAYER_FIELD.OBJECT_ID]: 2,
      [JOB_LAYER_FIELD.JOB_ID]: "job-002",
      [JOB_LAYER_FIELD.TITLE]: "Point Job",
    },
  });

  assert.deepEqual(selectedJob, {
    jobId: "job-002",
    jobTitle: "Point Job",
    objectId: 2,
    geometryType: "point",
    relatedAoiIds: [],
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
    relatedAoiIds: [],
  });
});

test("createJobSelectionFromGraphic returns empty Job id when graphic is missing Job attributes", () => {
  const selectedJob = createJobSelectionFromGraphic({
    attributes: {
      PRODUCTNAME: "Underlying AOI",
    },
  });

  assert.deepEqual(selectedJob, {
    jobId: "",
    jobTitle: "Selected Job",
    objectId: undefined,
    geometryType: "",
    relatedAoiIds: [],
  });
});
