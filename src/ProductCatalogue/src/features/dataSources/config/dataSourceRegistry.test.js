import assert from "node:assert/strict";
import test from "node:test";

import {
  DATA_SOURCE_AVAILABILITY,
  DATA_SOURCE_IDS,
  createDataSourceRegistry,
  getDefaultEnabledSourceIds,
  getRuntimeSelectableDataSources,
  isWorkspaceAvailableDataSource,
} from "./dataSourceRegistry.js";

test("registry defines independent target sources without a permanent combined source", () => {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  assert.deepEqual(
    registry.definitions.map((source) => source.id),
    ["s57", "s101", "paper-charts", "s102"]
  );
  assert.equal(registry.byId.has("enc"), false);
  assert.equal(registry.byId.has("enc-products"), false);
});

test("S-57 and S-101 remain known but unavailable for workspace resolution", () => {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  for (const sourceId of [DATA_SOURCE_IDS.S57, DATA_SOURCE_IDS.S101]) {
    const source = registry.byId.get(sourceId);
    assert.equal(source.availability.state, DATA_SOURCE_AVAILABILITY.UNAVAILABLE);
    assert.equal(source.userSelectable, false);
    assert.equal(source.loader, null);
    assert.equal(source.workspace.supported, false);
    assert.equal(isWorkspaceAvailableDataSource(source), false);
  }
});

test("development registry exposes Paper Charts and S-102 for Main-map and workspace use", () => {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  assert.deepEqual(
    getRuntimeSelectableDataSources(registry).map((source) => source.id),
    [DATA_SOURCE_IDS.PAPER_CHARTS, DATA_SOURCE_IDS.S102]
  );
  assert.deepEqual(getDefaultEnabledSourceIds(registry), [
    DATA_SOURCE_IDS.PAPER_CHARTS,
    DATA_SOURCE_IDS.S102,
  ]);
  for (const sourceId of [DATA_SOURCE_IDS.PAPER_CHARTS, DATA_SOURCE_IDS.S102]) {
    assert.equal(isWorkspaceAvailableDataSource(registry.byId.get(sourceId)), true);
  }

  assert.deepEqual(registry.byId.get(DATA_SOURCE_IDS.PAPER_CHARTS).normalizer.datasetNameStrategy, {
    type: "synthetic-prefix",
    prefix: "PAPER-MOCK",
  });
  assert.deepEqual(registry.byId.get(DATA_SOURCE_IDS.S102).normalizer.datasetNameStrategy, {
    type: "replace-leading-product-code",
    productCode: "102",
    fallbackPrefix: "102-MOCK",
  });
});

test("mock sources remain unavailable outside Development", () => {
  const registry = createDataSourceRegistry({ isDevelopment: false });
  assert.deepEqual(getRuntimeSelectableDataSources(registry), []);
  assert.deepEqual(getDefaultEnabledSourceIds(registry), []);
  assert.equal(
    isWorkspaceAvailableDataSource(registry.byId.get(DATA_SOURCE_IDS.PAPER_CHARTS)),
    false
  );
  assert.equal(isWorkspaceAvailableDataSource(registry.byId.get(DATA_SOURCE_IDS.S102)), false);
});

test("configuration-disabled sources are not selectable or workspace-available", () => {
  const registry = createDataSourceRegistry({
    isDevelopment: true,
    configuredSourceIds: [DATA_SOURCE_IDS.S102],
  });
  assert.deepEqual(
    getRuntimeSelectableDataSources(registry).map((source) => source.id),
    [DATA_SOURCE_IDS.S102]
  );
  assert.equal(
    isWorkspaceAvailableDataSource(registry.byId.get(DATA_SOURCE_IDS.PAPER_CHARTS)),
    false
  );
});

test("mock sources enable workspace surfaces while backend mutations remain disabled", () => {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  const enabledWorkspaceCapabilities = [
    "productCollection",
    "analyze",
    "review",
    "history",
    "icEncReports",
    "internalValidation",
    "productSearch",
    "popupExport",
  ];
  const disabledBackendCapabilities = [
    "freeze",
    "unfreeze",
    "sendToIcEnc",
    "cancelExport",
    "exportEdition",
    "exportUpdate",
    "backendProductRefresh",
  ];

  for (const sourceId of [DATA_SOURCE_IDS.PAPER_CHARTS, DATA_SOURCE_IDS.S102]) {
    const source = registry.byId.get(sourceId);
    const layerCapabilities = source.layerDefinitions[0].capabilities;
    for (const capability of enabledWorkspaceCapabilities) {
      assert.equal(source.capabilities[capability], true, capability);
    }
    for (const capability of disabledBackendCapabilities) {
      assert.equal(source.capabilities[capability], false, capability);
    }
    assert.equal(layerCapabilities.supportsPopupActions, true);
    assert.equal(layerCapabilities.supportsProductActions, false);
    assert.equal(layerCapabilities.supportsProductHistory, false);
    for (const content of Object.values(source.contentConfiguration)) {
      assert.equal(content.visible, true);
      assert.equal(content.implemented, false);
      assert.equal(content.loaderId, null);
      assert.match(content.availabilityReason, new RegExp(source.label.replace("-", "-")));
    }
    for (const leaf of source.exportConfiguration.leaves) {
      assert.equal(leaf.implemented, false);
      assert.equal(leaf.backendTarget, null);
      assert.equal(leaf.handlerId, null);
    }
  }
});
