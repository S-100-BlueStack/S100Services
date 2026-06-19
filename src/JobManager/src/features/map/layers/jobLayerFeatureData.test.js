import assert from "node:assert/strict";
import test from "node:test";

import {
  createJobLayerFeatureData,
  getJobRenderClass,
  JOB_LAYER_FIELD,
  JOB_RENDER_CLASS,
} from "./jobLayerFeatureData.js";

const JOBS = Object.freeze([
  {
    id: "job-point",
    title: "Point Job",
    summary: "Point summary",
    createdAt: "2026-06-10T00:00:00.000Z",
    deadline: "2026-06-30T00:00:00.000Z",
    priority: "high",
    status: "todo",
    relatedAoiIds: ["aoi-001"],
    geometry: {
      type: "point",
      longitude: 10.1,
      latitude: 56.2,
      spatialReference: {
        wkid: 4326,
      },
    },
  },
  {
    id: "job-polygon",
    title: "Polygon Job",
    summary: "Polygon summary",
    createdAt: "2026-06-11T00:00:00.000Z",
    deadline: null,
    priority: "medium",
    status: "inProgress",
    relatedAoiIds: ["aoi-001", "aoi-002"],
    geometry: {
      type: "polygon",
      rings: [
        [
          [10, 56],
          [10.2, 56],
          [10.2, 56.2],
          [10, 56],
        ],
      ],
      spatialReference: {
        wkid: 4326,
      },
    },
  },
  {
    id: "job-missing-geometry",
    title: "Missing geometry",
    priority: "low",
    status: "todo",
    relatedAoiIds: [],
    geometry: null,
  },
]);

test("createJobLayerFeatureData splits point and polygon Jobs into separate feature sets", () => {
  const featureData = createJobLayerFeatureData(JOBS);

  assert.equal(featureData.pointFeatures.length, 1);
  assert.equal(featureData.polygonFeatures.length, 1);

  assert.equal(featureData.pointFeatures[0].geometry.type, "point");
  assert.equal(featureData.pointFeatures[0].geometry.x, 10.1);
  assert.equal(featureData.pointFeatures[0].geometry.y, 56.2);

  assert.equal(featureData.polygonFeatures[0].geometry.type, "polygon");
  assert.deepEqual(featureData.polygonFeatures[0].geometry.rings[0][0], [10, 56]);
});

test("createJobLayerFeatureData creates stable popup and renderer attributes", () => {
  const featureData = createJobLayerFeatureData(JOBS);
  const pointAttributes = featureData.pointFeatures[0].attributes;
  const polygonAttributes = featureData.polygonFeatures[0].attributes;

  assert.equal(pointAttributes[JOB_LAYER_FIELD.OBJECT_ID], 1);
  assert.equal(pointAttributes[JOB_LAYER_FIELD.JOB_ID], "job-point");
  assert.equal(pointAttributes[JOB_LAYER_FIELD.STATUS_LABEL], "To do");
  assert.equal(pointAttributes[JOB_LAYER_FIELD.PRIORITY_LABEL], "High");
  assert.equal(pointAttributes[JOB_LAYER_FIELD.RELATED_AOI_COUNT], 1);
  assert.equal(pointAttributes[JOB_LAYER_FIELD.RENDER_CLASS], JOB_RENDER_CLASS.ACTIVE_HIGH);

  assert.equal(polygonAttributes[JOB_LAYER_FIELD.OBJECT_ID], 2);
  assert.equal(polygonAttributes[JOB_LAYER_FIELD.DEADLINE], "-");
  assert.equal(polygonAttributes[JOB_LAYER_FIELD.RELATED_AOI_COUNT], 2);
  assert.equal(polygonAttributes[JOB_LAYER_FIELD.RENDER_CLASS], JOB_RENDER_CLASS.ACTIVE_MEDIUM);
});

test("getJobRenderClass keeps Done Jobs visually separate from priority", () => {
  assert.equal(
    getJobRenderClass({
      priority: "high",
      status: "done",
    }),
    JOB_RENDER_CLASS.DONE
  );

  assert.equal(
    getJobRenderClass({
      priority: "low",
      status: "todo",
    }),
    JOB_RENDER_CLASS.ACTIVE_LOW
  );
});
