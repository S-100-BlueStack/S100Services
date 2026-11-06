import assert from "node:assert/strict";
import test from "node:test";

import { AOI_LAYER_READINESS_STATUS, validateAoiFeatureLayer } from "./aoiService.js";

test("validateAoiFeatureLayer returns a missing-config readiness result without a layer", async () => {
  const result = await validateAoiFeatureLayer();

  assert.equal(result.ok, true);
  assert.equal(result.data.status, AOI_LAYER_READINESS_STATUS.MISSING_CONFIG);
  assert.equal(result.data.isConfigured, false);
  assert.equal(result.data.featureCount, null);
  assert.deepEqual(result.data.warnings, ["AOI Feature Service URL is not configured."]);
});

test("validateAoiFeatureLayer returns an error result when the layer cannot load", async () => {
  const result = await validateAoiFeatureLayer({
    aoiLayer: createAoiLayerStub({
      loadError: new Error("Layer load failed."),
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.message, "Layer load failed.");
  assert.equal(result.meta.operation, "validateAoiFeatureLayer");
  assert.equal(result.meta.layerId, "aoi-layer-test");
});

test("validateAoiFeatureLayer reports ready when required fields and feature count are available", async () => {
  let observedQuery = null;
  const result = await validateAoiFeatureLayer({
    aoiLayer: createAoiLayerStub({
      fields: [{ name: "GlobalID" }, { name: "PRODUCTNAME" }, { name: "OBJECTID" }],
      featureCount: 12,
      onQueryFeatureCount(query) {
        observedQuery = query;
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, AOI_LAYER_READINESS_STATUS.READY);
  assert.equal(result.data.isConfigured, true);
  assert.equal(result.data.featureCount, 12);
  assert.equal(result.data.fieldReport.hasRequiredFields, true);
  assert.equal(result.data.spatialReference.wkid, 25832);
  assert.equal(observedQuery.where, "1=1");
});

test("validateAoiFeatureLayer warns when required fields are missing", async () => {
  const result = await validateAoiFeatureLayer({
    aoiLayer: createAoiLayerStub({
      fields: [{ name: "OBJECTID" }],
      featureCount: 4,
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, AOI_LAYER_READINESS_STATUS.WARNING);
  assert.equal(result.data.fieldReport.hasRequiredFields, false);
  assert.deepEqual(
    result.data.fieldReport.missingRequiredFields.map((fieldInfo) => fieldInfo.fieldName),
    ["GlobalID", "PRODUCTNAME"]
  );
  assert.match(result.data.warnings[0], /Missing required AOI field/);
});

test("validateAoiFeatureLayer keeps validation successful but warning when feature count cannot be checked", async () => {
  const result = await validateAoiFeatureLayer({
    aoiLayer: createAoiLayerStub({
      fields: [{ name: "GlobalID" }, { name: "PRODUCTNAME" }],
      queryError: new Error("Count failed."),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, AOI_LAYER_READINESS_STATUS.WARNING);
  assert.equal(result.data.featureCount, null);
  assert.ok(result.data.warnings.some((warning) => warning.includes("Count failed.")));
});

function createAoiLayerStub({
  fields = [{ name: "GlobalID" }, { name: "PRODUCTNAME" }],
  featureCount = 1,
  loadError = null,
  queryError = null,
  onQueryFeatureCount = () => {},
} = {}) {
  return {
    id: "aoi-layer-test",
    title: "AOI Test Layer",
    url: "https://example.com/aoi/FeatureServer/0",
    fields,
    objectIdField: "OBJECTID",
    geometryType: "polygon",
    spatialReference: {
      toJSON() {
        return {
          wkid: 25832,
        };
      },
    },
    async load() {
      if (loadError) {
        throw loadError;
      }
    },
    createQuery() {
      return {
        where: "original",
      };
    },
    async queryFeatureCount(query) {
      onQueryFeatureCount(query);

      if (queryError) {
        throw queryError;
      }

      return featureCount;
    },
  };
}
