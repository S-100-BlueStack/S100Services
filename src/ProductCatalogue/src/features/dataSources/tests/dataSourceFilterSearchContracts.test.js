import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  DATA_SOURCE_IDS,
  createDataSourceRegistry,
  getDataSourceDefinition,
} from "../config/dataSourceRegistry.js";
import { ATTRIBUTE_FILTER_CONFIG } from "../../map/filters/attributeFilterConfig.js";
import { createAttributeFilterService } from "../../map/filters/attributeFilterService.js";
import { createSourceAwareProductSearchIndex } from "../../map/search/sourceAwareProductSearchIndex.js";
import { PRODUCT_CORRECTIONS_LAYER_ID } from "../../../shared/config/layerIds.js";
import { createDataSourceDerivedStateCoordinator } from "../services/dataSourceDerivedStateCoordinator.js";
const projectRoot = new URL("../../../..", import.meta.url);
const MOCK_LAYER_CAPABILITIES = Object.freeze({
  supportsPopup: true,
  supportsPopupActions: true,
  supportsProductActions: false,
  supportsAttributeFilters: true,
  supportsProductHistory: false,
  supportsOverlapPicker: true,
  supportsProductSearch: true,
});

const WORKSPACE_SURFACE_CAPABILITIES = Object.freeze([
  "productCollection",
  "analyze",
  "review",
  "history",
  "icEncReports",
  "internalValidation",
]);
const DISABLED_BACKEND_PRODUCT_CAPABILITIES = Object.freeze([
  "freeze",
  "unfreeze",
  "sendToIcEnc",
  "cancelExport",
  "exportEdition",
  "exportUpdate",
  "backendProductRefresh",
]);
describe("FI-011B/FI-011D data source integration contracts", () => {
  it("separates workspace surfaces from backend Product implementations", () => {
    const registry = createDataSourceRegistry({ isDevelopment: true });
    const paper = getDataSourceDefinition(registry, DATA_SOURCE_IDS.PAPER_CHARTS);
    const s102 = getDataSourceDefinition(registry, DATA_SOURCE_IDS.S102);
    assert.deepEqual(paper.filtering.definitions, ["status", "displayScale", "usageBand"]);
    assert.deepEqual(s102.filtering.definitions, ["status"]);

    for (const source of [paper, s102]) {
      const layerCapabilities = source.layerDefinitions[0].capabilities;
      assert.equal(source.search.supported, true);
      assert.equal(source.capabilities.productSearch, true);
      assert.equal(source.capabilities.popupExport, true);
      assert.deepEqual(
        {
          supportsPopup: layerCapabilities.supportsPopup,
          supportsPopupActions: layerCapabilities.supportsPopupActions,
          supportsProductActions: layerCapabilities.supportsProductActions,
          supportsAttributeFilters: layerCapabilities.supportsAttributeFilters,
          supportsProductHistory: layerCapabilities.supportsProductHistory,
          supportsOverlapPicker: layerCapabilities.supportsOverlapPicker,
          supportsProductSearch: layerCapabilities.supportsProductSearch,
        },
        MOCK_LAYER_CAPABILITIES
      );
      for (const capabilityName of WORKSPACE_SURFACE_CAPABILITIES) {
        assert.equal(source.capabilities[capabilityName], true);
      }
      for (const capabilityName of DISABLED_BACKEND_PRODUCT_CAPABILITIES) {
        assert.equal(source.capabilities[capabilityName], false);
      }
      for (const content of Object.values(source.contentConfiguration)) {
        assert.equal(content.visible, true);
        assert.equal(content.implemented, false);
        assert.equal(content.loaderId, null);
      }
      assert.equal(source.exportConfiguration.visible, true);
      assert.deepEqual(
        source.exportConfiguration.leaves.map((leaf) => ({
          label: leaf.label,
          implemented: leaf.implemented,
          backendTarget: leaf.backendTarget,
          handlerId: leaf.handlerId,
        })),
        [
          {
            label: "Edition",
            implemented: false,
            backendTarget: null,
            handlerId: null,
          },
          {
            label: "Update",
            implemented: false,
            backendTarget: null,
            handlerId: null,
          },
        ]
      );
    }
  });
  it("keeps error-only default behind the authoritative FI-016 classification point", () => {
    assert.equal(ATTRIBUTE_FILTER_CONFIG.stateVersion, 2);
    assert.equal(
      ATTRIBUTE_FILTER_CONFIG.compatibilityProvider.legacySnapshotProviderId,
      PRODUCT_CORRECTIONS_LAYER_ID
    );
    assert.equal(ATTRIBUTE_FILTER_CONFIG.compatibilityProvider.errorOnlyStatusClassifier, null);
    assert.deepEqual(ATTRIBUTE_FILTER_CONFIG.compatibilityProvider.defaultExcludedValues, [
      { fieldName: "status", values: ["1"] },
    ]);
  });
  it("does not introduce a permanent compatibility source id", () => {
    const registry = createDataSourceRegistry({ isDevelopment: true });
    const ids = registry.definitions.map((source) => source.id);
    assert.deepEqual(ids, ["s57", "s101", "paper-charts", "s102"]);
    assert.equal(ids.includes("enc"), false);
    assert.equal(ids.includes("enc-products"), false);
  });
  it("publishes and removes derived state through the generic lifecycle contract", () => {
    const lifecycle = createLifecycleHarness();
    const filterCalls = [];
    const searchCalls = [];
    const coordinator = createDataSourceDerivedStateCoordinator({
      lifecycle,
      filterService: {
        replaceProvider: (value) => filterCalls.push(["replace", value]),
        removeProvider: (id, options) => filterCalls.push(["remove", { id, ...options }]),
        suspendProvider: (id, options) => filterCalls.push(["suspend", { id, ...options }]),
        getProviderGeneration: () => 1,
      },
      productSearchIndex: {
        replaceProvider: (value) => searchCalls.push(["replace", value]),
        removeProvider: (id, options) => searchCalls.push(["remove", { id, ...options }]),
        getProviderGeneration: () => 1,
      },
    });
    const source = {
      id: "future-source",
      label: "Future source",
      capabilities: { productSearch: true },
      filtering: {
        supported: true,
        definitions: ["status"],
        defaultExcludedValues: [],
        useLookupOptions: false,
      },
      search: { supported: true, fields: ["datasetName"] },
    };
    lifecycle.emit("activated", {
      sourceId: source.id,
      source,
      generation: 2,
      layers: [
        {
          id: "future-products",
          appLayerCapabilities: {
            supportsAttributeFilters: true,
            supportsProductSearch: true,
          },
        },
      ],
    });
    lifecycle.emit("deactivating", {
      sourceId: source.id,
      generation: 3,
      reason: "user-deactivation",
    });
    assert.equal(filterCalls[0][0], "replace");
    assert.equal(filterCalls[0][1].providerId, "future-source");
    assert.deepEqual(filterCalls[0][1].filterDefinitions, ["status"]);
    assert.equal(filterCalls[0][1].layers[0].id, "future-products");
    assert.deepEqual(filterCalls[1], ["remove", { id: "future-source", generation: 3 }]);
    assert.equal(searchCalls[0][1].providerId, "future-source");
    assert.equal(searchCalls[0][1].layers[0].id, "future-products");
    assert.deepEqual(searchCalls[1], ["remove", { id: "future-source", generation: 3 }]);
    coordinator.destroy();
  });
  it("preserves pending filter intent when activation failure follows snapshot loading", () => {
    const lifecycle = createLifecycleHarness();
    const filterService = createFilterService();
    const productSearchIndex = createSourceAwareProductSearchIndex();
    const coordinator = createDataSourceDerivedStateCoordinator({
      lifecycle,
      filterService,
      productSearchIndex,
    });
    const source = createRuntimeSource();
    const snapshot = createPaperFilterSnapshot();
    assert.equal(filterService.applyFilterSnapshot(snapshot), true);
    lifecycle.emit("deactivating", {
      sourceId: source.id,
      source,
      reason: "activation-failed",
    });
    assert.deepEqual(filterService.getFilterSnapshot(), snapshot);
    assert.equal(productSearchIndex.getEntries().length, 0);
    lifecycle.emit("activated", {
      sourceId: source.id,
      source,
      generation: 2,
      layers: [createRuntimeLayer()],
    });
    assert.deepEqual([...filterService.getSelectedValues(source.id, "status")], ["Error"]);
    assert.equal(filterService.getLayerMetadata(source.id).visibleCount, 1);
    assert.equal(productSearchIndex.getEntries().length, 2);
    coordinator.destroy();
  });
  it("preserves pending filter intent when snapshot loading follows activation failure", () => {
    const lifecycle = createLifecycleHarness();
    const filterService = createFilterService();
    const productSearchIndex = createSourceAwareProductSearchIndex();
    const coordinator = createDataSourceDerivedStateCoordinator({
      lifecycle,
      filterService,
      productSearchIndex,
    });
    const source = createRuntimeSource();
    const snapshot = createPaperFilterSnapshot();
    lifecycle.emit("deactivating", {
      sourceId: source.id,
      source,
      reason: "activation-failed",
    });
    assert.equal(filterService.applyFilterSnapshot(snapshot), true);
    lifecycle.emit("activated", {
      sourceId: source.id,
      source,
      generation: 2,
      layers: [createRuntimeLayer()],
    });
    assert.deepEqual(filterService.getFilterSnapshot(), snapshot);
    assert.deepEqual([...filterService.getSelectedValues(source.id, "status")], ["Error"]);
    assert.equal(productSearchIndex.getEntries().length, 2);
    coordinator.destroy();
  });
  it("treats explicit deactivation and reset reasons as authoritative removal", () => {
    for (const reason of ["user-deactivation", "local-reset", "global-reset"]) {
      const lifecycle = createLifecycleHarness();
      const filterService = createFilterService();
      const productSearchIndex = createSourceAwareProductSearchIndex();
      const coordinator = createDataSourceDerivedStateCoordinator({
        lifecycle,
        filterService,
        productSearchIndex,
      });
      const source = createRuntimeSource();
      assert.equal(filterService.applyFilterSnapshot(createPaperFilterSnapshot()), true);
      lifecycle.emit("deactivating", {
        sourceId: source.id,
        source,
        generation: 1,
        reason,
      });
      assert.deepEqual(filterService.getFilterSnapshot(), { version: 2, sources: [] });
      assert.equal(productSearchIndex.getEntries().length, 0);
      coordinator.destroy();
    }
  });
  it("keeps failed refresh state and blocks stale publication after activation failure", () => {
    const lifecycle = createLifecycleHarness();
    const filterService = createFilterService();
    const productSearchIndex = createSourceAwareProductSearchIndex();
    const coordinator = createDataSourceDerivedStateCoordinator({
      lifecycle,
      filterService,
      productSearchIndex,
    });
    const source = createRuntimeSource();
    const firstLayer = createRuntimeLayer();
    lifecycle.emit("activated", {
      sourceId: source.id,
      source,
      generation: 1,
      layers: [firstLayer],
    });
    filterService.setFilter(source.id, "status", ["Error"], 2);
    const resultId = productSearchIndex.getEntries()[0].id;
    lifecycle.emit("refresh-failed", {
      sourceId: source.id,
      source,
      generation: 2,
    });
    assert.deepEqual([...filterService.getSelectedValues(source.id, "status")], ["Error"]);
    assert.equal(productSearchIndex.resolve(resultId).graphic.layer, firstLayer);
    lifecycle.emit("deactivating", {
      sourceId: "delayed-source",
      source: { ...source, id: "delayed-source" },
      reason: "activation-failed",
    });
    lifecycle.emit("activated", {
      sourceId: "delayed-source",
      source: { ...source, id: "delayed-source" },
      generation: 1,
      layers: [createRuntimeLayer("delayed-products")],
    });
    assert.equal(filterService.getLayerMetadata("delayed-source"), null);
    assert.equal(
      productSearchIndex.getEntries().some((entry) => entry.providerId === "delayed-source"),
      false
    );
    coordinator.destroy();
  });
  it("canonicalizes parsed filter snapshots through the panel persistence lifecycle", async () => {
    const panelSource = await readFile(
      new URL("src/features/map/filters/attributeFilterPanel.js", projectRoot),
      "utf8"
    );
    assert.match(panelSource, /readAttributeFilterSnapshot/);
    assert.match(
      panelSource,
      new RegExp(
        "filterService\\.applyFilterSnapshot\\(saved\\.snapshot\\)[\\s\\S]*" +
          "writeFilterSnapshot\\(filterService\\)"
      )
    );
    assert.match(panelSource, /if \(saved\.exists\) \{[\s\S]*removeSavedFilterSnapshot\(\)/);
  });
  it("persists Clear all after clearing active and pending service state", async () => {
    const panelSource = await readFile(
      new URL("src/features/map/filters/attributeFilterPanel.js", projectRoot),
      "utf8"
    );
    assert.match(
      panelSource,
      /function clearAllFilters\(\) \{[\s\S]*filterService\.clearAll\(\);[\s\S]*/
    );
    assert.match(
      panelSource,
      /function clearAllFilters\(\) \{[\s\S]*writeFilterSnapshot\(filterService\)/
    );
  });
  it("does not persist temporary provider suspension as an authoritative removal", async () => {
    const panelSource = await readFile(
      new URL("src/features/map/filters/attributeFilterPanel.js", projectRoot),
      "utf8"
    );
    assert.match(panelSource, /detail\.type === "provider-suspended"/);
    assert.match(panelSource, /const isTemporarySuspension/);
    assert.match(panelSource, /!isTemporarySuspension/);
  });
  it("documents provider and Product identity consistently across search READMEs", async () => {
    const [dataSourceReadme, searchReadme] = await Promise.all([
      readFile(new URL("src/features/dataSources/README.md", projectRoot), "utf8"),
      readFile(new URL("src/features/map/search/README.md", projectRoot), "utf8"),
    ]);
    for (const content of [dataSourceReadme, searchReadme]) {
      assert.match(content, /\[providerId, productKey\]/);
      assert.doesNotMatch(content, /Result IDs include provider, layer, and Product identity/);
    }
  });
  it("routes search selection through the existing popup and selected-graphic flow", async () => {
    const searchSource = await readFile(
      new URL("src/features/map/search/mainMapProductSearch.js", projectRoot),
      "utf8"
    );
    assert.match(searchSource, /productSearchIndex\.resolve\(resultId\)/);
    assert.match(searchSource, /let graphic = result\.graphic/);
    assert.match(searchSource, /const currentResult = productSearchIndex\.resolve\(result\.id\)/);
    assert.match(searchSource, /openProductPopup\(view, graphic, location\)/);
    assert.match(searchSource, /features: \[graphic\]/);
    assert.doesNotMatch(searchSource, /setSourceEnabled|activateSource/);
  });
});
function createFilterService() {
  return createAttributeFilterService({
    getStatuses: () => [],
    getUsages: () => [],
  });
}
function createRuntimeSource() {
  return {
    id: "paper-charts",
    label: "Paper Charts",
    capabilities: { productSearch: true },
    filtering: {
      supported: true,
      definitions: ["status"],
      defaultExcludedValues: [],
      useLookupOptions: false,
    },
    search: { supported: true, fields: ["datasetName"] },
  };
}
function createPaperFilterSnapshot() {
  return {
    version: 2,
    sources: [
      {
        providerId: "paper-charts",
        fields: [{ fieldName: "status", mode: "values", values: ["Error"] }],
      },
    ],
  };
}
function createRuntimeLayer(id = "paper-products") {
  const graphics = [
    {
      attributes: {
        datasetName: "PAPER-ERROR",
        productIdentityKey: "paper-error",
        status: "Error",
      },
    },
    {
      attributes: {
        datasetName: "PAPER-PUBLISHED",
        productIdentityKey: "paper-published",
        status: "Published",
      },
    },
  ];
  const layer = {
    id,
    appLayerId: id,
    appLayerCapabilities: {
      supportsAttributeFilters: true,
      supportsProductSearch: true,
    },
    graphics: { toArray: () => graphics },
  };
  graphics.forEach((graphic) => {
    graphic.layer = layer;
  });
  return layer;
}
function createLifecycleHarness() {
  const listeners = new Map();
  return {
    subscribe(eventName, listener) {
      const bucket = listeners.get(eventName) ?? new Set();
      bucket.add(listener);
      listeners.set(eventName, bucket);
      return () => bucket.delete(listener);
    },
    emit(eventName, payload) {
      for (const listener of listeners.get(eventName) ?? []) listener(payload);
    },
  };
}
