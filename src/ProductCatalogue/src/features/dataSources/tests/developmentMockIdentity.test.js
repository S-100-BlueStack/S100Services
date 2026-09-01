import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { DATA_SOURCE_IDS, createDataSourceRegistry } from "../config/dataSourceRegistry.js";
import { normalizeDataSourcePayload } from "../services/dataSourceNormalizer.js";

const PRODUCT_CATALOGUE_API_ROOT = fileURLToPath(
  new URL("../../../../../ProductCatalogueAPI/", import.meta.url)
);

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

async function readFixture(relativePath) {
  return JSON.parse(await readFile(`${PRODUCT_CATALOGUE_API_ROOT}${relativePath}`, "utf8"));
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

test("Development mock fixture files normalize to globally unique source datasetNames", async () => {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  const paperSource = registry.byId.get(DATA_SOURCE_IDS.PAPER_CHARTS);
  const s102Source = registry.byId.get(DATA_SOURCE_IDS.S102);
  const [paperPayload, s102Payload] = await Promise.all([
    readFixture("mock/some_products.geojson"),
    readFixture("mock/products.geojson"),
  ]);
  const paper = normalizeDataSourcePayload(paperPayload, paperSource);
  const s102 = normalizeDataSourcePayload(s102Payload, s102Source);

  const paperNames = paper.products.map((product) => product.datasetName);
  const s102Names = s102.products.map((product) => product.datasetName);
  const allNames = [...paperNames, ...s102Names];
  const normalizedKeys = allNames.map((datasetName) => datasetName.trim().toUpperCase());

  assert.equal(new Set(normalizedKeys).size, normalizedKeys.length);
  assert.equal(new Set(paperNames.map((name) => name.toUpperCase())).size, paperNames.length);
  assert.equal(new Set(s102Names.map((name) => name.toUpperCase())).size, s102Names.length);
  assert.equal(
    paperNames.every((datasetName) => datasetName.startsWith("PAPER-MOCK-")),
    true
  );
  assert.equal(
    s102Names.every((datasetName) => datasetName.startsWith("102")),
    true
  );
  assert.equal(
    allNames.some((datasetName) => /\((?:S-?102|Paper Charts)\)/i.test(datasetName)),
    false
  );
});
