import assert from "node:assert/strict";
import test from "node:test";

import {
  DATA_SOURCE_AVAILABILITY,
  DATA_SOURCE_IDS,
  createDataSourceRegistry,
  getDefaultEnabledSourceIds,
  getRuntimeSelectableDataSources,
} from "./dataSourceRegistry.js";

test("registry defines independent target sources without a permanent combined source", () => {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  assert.deepEqual(
    registry.definitions.map((source) => source.id),
    ["s57", "s101", "paper-charts", "s102"]
  );
  assert.equal(registry.byId.has("enc"), false);
  assert.equal(registry.byId.has("enc-products"), false);
  assert.equal(
    registry.definitions.some((source) => source.label === "ENC Products"),
    false
  );
});

test("S-57 and S-101 are known but unavailable until authoritative loaders exist", () => {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  for (const sourceId of [DATA_SOURCE_IDS.S57, DATA_SOURCE_IDS.S101]) {
    const source = registry.byId.get(sourceId);
    assert.equal(source.availability.state, DATA_SOURCE_AVAILABILITY.UNAVAILABLE);
    assert.equal(source.userSelectable, false);
    assert.equal(source.loader, null);
    assert.deepEqual(source.layerDefinitions, []);
  }
});

test("development registry exposes only Paper Charts and S-102 as selectable", () => {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  assert.deepEqual(
    getRuntimeSelectableDataSources(registry).map((source) => source.id),
    [DATA_SOURCE_IDS.PAPER_CHARTS, DATA_SOURCE_IDS.S102]
  );
  assert.deepEqual(getDefaultEnabledSourceIds(registry), [
    DATA_SOURCE_IDS.PAPER_CHARTS,
    DATA_SOURCE_IDS.S102,
  ]);
});

test("mock sources are unavailable outside Development", () => {
  const registry = createDataSourceRegistry({ isDevelopment: false });
  assert.deepEqual(getRuntimeSelectableDataSources(registry), []);
  assert.deepEqual(getDefaultEnabledSourceIds(registry), []);
});

test("configuration-disabled sources are not selectable or default-enabled", () => {
  const registry = createDataSourceRegistry({
    isDevelopment: true,
    configuredSourceIds: [DATA_SOURCE_IDS.S102],
  });
  assert.deepEqual(
    getRuntimeSelectableDataSources(registry).map((source) => source.id),
    [DATA_SOURCE_IDS.S102]
  );
  assert.deepEqual(getDefaultEnabledSourceIds(registry), [DATA_SOURCE_IDS.S102]);
  assert.equal(registry.byId.get(DATA_SOURCE_IDS.PAPER_CHARTS).enabledByConfiguration, false);
});

test("mock sources enable frontend search while backend workflows remain disabled", () => {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  const backendWorkflowCapabilities = [
    "freeze",
    "unfreeze",
    "sendToIcEnc",
    "cancelExport",
    "history",
    "icEncReports",
    "internalValidation",
    "exportEdition",
    "exportUpdate",
    "productCollection",
    "analyze",
    "review",
  ];

  for (const sourceId of [DATA_SOURCE_IDS.PAPER_CHARTS, DATA_SOURCE_IDS.S102]) {
    const source = registry.byId.get(sourceId);
    const layerCapabilities = source.layerDefinitions[0].capabilities;

    assert.equal(source.capabilities.productSearch, true);
    assert.equal(source.search.supported, true);
    assert.equal(source.filtering.supported, true);

    assert.equal(layerCapabilities.supportsPopup, true);
    assert.equal(layerCapabilities.supportsAttributeFilters, true);
    assert.equal(layerCapabilities.supportsOverlapPicker, true);
    assert.equal(layerCapabilities.supportsProductSearch, true);

    assert.equal(layerCapabilities.supportsPopupActions, false);
    assert.equal(layerCapabilities.supportsProductActions, false);
    assert.equal(layerCapabilities.supportsProductHistory, false);

    for (const capability of backendWorkflowCapabilities) {
      assert.equal(source.capabilities[capability], false, capability);
    }
  }
});
