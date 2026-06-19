import assert from "node:assert/strict";
import test from "node:test";

import { JOB_LAYER_FIELD } from "../layers/jobLayerFeatureData.js";
import {
  createJobSelectionFromGraphic,
  createJobSelectionFromPopupViewModel,
} from "./jobPopupActions.js";

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

test("createJobSelectionFromPopupViewModel prefers selected popup feature when it is a Job", () => {
  const selectedJob = createJobSelectionFromPopupViewModel({
    selectedFeatureIndex: 1,
    selectedFeature: {
      attributes: {
        PRODUCTNAME: "Underlying AOI",
      },
    },
    features: [
      {
        attributes: {
          PRODUCTNAME: "Underlying AOI",
        },
      },
      {
        geometry: {
          type: "point",
        },
        attributes: {
          [JOB_LAYER_FIELD.OBJECT_ID]: 5,
          [JOB_LAYER_FIELD.JOB_ID]: "job-point",
          [JOB_LAYER_FIELD.TITLE]: "Point Job",
          [JOB_LAYER_FIELD.GEOMETRY_TYPE]: "point",
        },
      },
    ],
  });

  assert.deepEqual(selectedJob, {
    jobId: "job-point",
    jobTitle: "Point Job",
    objectId: 5,
    geometryType: "point",
  });
});

test("createJobSelectionFromPopupViewModel supports ArcGIS collection-like popup features", () => {
  const selectedJob = createJobSelectionFromPopupViewModel({
    selectedFeatureIndex: 0,
    features: {
      length: 1,
      at(index) {
        if (index !== 0) {
          return null;
        }

        return {
          attributes: {
            [JOB_LAYER_FIELD.OBJECT_ID]: 8,
            [JOB_LAYER_FIELD.JOB_ID]: "job-polygon",
            [JOB_LAYER_FIELD.TITLE]: "Polygon Job",
            [JOB_LAYER_FIELD.GEOMETRY_TYPE]: "polygon",
          },
        };
      },
    },
  });

  assert.deepEqual(selectedJob, {
    jobId: "job-polygon",
    jobTitle: "Polygon Job",
    objectId: 8,
    geometryType: "polygon",
  });
});
