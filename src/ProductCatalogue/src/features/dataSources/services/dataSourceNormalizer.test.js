import assert from "node:assert/strict";
import test from "node:test";

import { DATA_SOURCE_IDS, createDataSourceRegistry } from "../config/dataSourceRegistry.js";
import { normalizeDataSourcePayload } from "./dataSourceNormalizer.js";

const registry = createDataSourceRegistry({ isDevelopment: true });
const paperSource = registry.byId.get(DATA_SOURCE_IDS.PAPER_CHARTS);
const s102Source = registry.byId.get(DATA_SOURCE_IDS.S102);

function createFeature(datasetName, extra = {}) {
  return {
    type: "Feature",
    properties: { DatasetName: datasetName, Edition: 2, Update: 4, Status: "Ready", ...extra },
    geometry: { type: "Point", coordinates: [12, 56] },
  };
}

test("normalizer produces stable lowercase attributes and source-aware metadata", () => {
  const result = normalizeDataSourcePayload(
    { type: "FeatureCollection", features: [createFeature("P001")] },
    paperSource
  );
  const attributes = result.layers[0].data.features[0].properties;

  assert.equal(attributes.datasetName, "P001");
  assert.equal(attributes.edition, 2);
  assert.equal(attributes.update, 4);
  assert.equal(attributes.status, "Ready");
  assert.equal(attributes.sourceId, "paper-charts");
  assert.equal(attributes.productKey, "P001");
  assert.equal(attributes.productIdentityKey, '["paper-charts","P001"]');
});

test("feature order does not affect normalized identity", () => {
  const first = normalizeDataSourcePayload(
    { type: "FeatureCollection", features: [createFeature("A"), createFeature("B")] },
    s102Source
  );
  const reordered = normalizeDataSourcePayload(
    { type: "FeatureCollection", features: [createFeature("B"), createFeature("A")] },
    s102Source
  );

  assert.deepEqual(
    new Set(first.products.map((product) => product.productIdentityKey)),
    new Set(reordered.products.map((product) => product.productIdentityKey))
  );
});

test("equal Product keys in different sources produce different identities", () => {
  const payload = { type: "FeatureCollection", features: [createFeature("P001")] };
  const paper = normalizeDataSourcePayload(payload, paperSource);
  const s102 = normalizeDataSourcePayload(payload, s102Source);

  assert.notEqual(paper.products[0].productIdentityKey, s102.products[0].productIdentityKey);
});

test("missing stable identity rejects the complete payload", () => {
  assert.throws(
    () =>
      normalizeDataSourcePayload(
        {
          type: "FeatureCollection",
          features: [createFeature("P001"), createFeature(undefined, { DatasetName: undefined })],
        },
        paperSource
      ),
    /feature at index 1 is missing a stable product identity/
  );
});

test("duplicate identity rejects the complete payload", () => {
  assert.throws(
    () =>
      normalizeDataSourcePayload(
        { type: "FeatureCollection", features: [createFeature("P001"), createFeature("P001")] },
        paperSource
      ),
    /duplicate product identity/
  );
});

test("invalid source payload is rejected before layer preparation", () => {
  assert.throws(
    () => normalizeDataSourcePayload({ data: [] }, paperSource),
    /invalid GeoJSON payload/
  );
});
