import assert from "node:assert/strict";
import test from "node:test";

import { DATA_SOURCE_IDS, createDataSourceRegistry } from "../config/dataSourceRegistry.js";
import { normalizeDataSourcePayload } from "../services/dataSourceNormalizer.js";

function feature(datasetName, productName = "1149E") {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [10, 56] },
    properties: {
      datasetName,
      productName,
      status: "Available",
    },
  };
}

function getDevelopmentSource(sourceId) {
  return createDataSourceRegistry({ isDevelopment: true }).byId.get(sourceId);
}

test("S-102 Development identity replaces legacy display suffix with source-appropriate datasetName", () => {
  const source = getDevelopmentSource(DATA_SOURCE_IDS.S102);
  const normalized = normalizeDataSourcePayload(
    { type: "FeatureCollection", features: [feature("101DK0041149E (S-102)")] },
    source
  );

  assert.equal(normalized.products[0].datasetName, "102DK0041149E");
  assert.equal(normalized.products[0].productName, "1149E");
});

test("Paper Charts Development identity is stable and does not encode a UI label suffix", () => {
  const source = getDevelopmentSource(DATA_SOURCE_IDS.PAPER_CHARTS);
  const payload = {
    type: "FeatureCollection",
    features: [feature("101DK0041149E (Paper Charts)")],
  };
  const first = normalizeDataSourcePayload(payload, source);
  const second = normalizeDataSourcePayload(payload, source);

  assert.equal(first.products[0].datasetName, "PAPER-MOCK-101DK0041149E");
  assert.equal(second.products[0].datasetName, first.products[0].datasetName);
  assert.equal(first.products[0].productName, "1149E");
  assert.doesNotMatch(first.products[0].datasetName, /\(Paper Charts\)/i);
});
