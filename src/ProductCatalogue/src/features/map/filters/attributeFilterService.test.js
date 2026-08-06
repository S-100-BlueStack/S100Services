import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PRODUCT_CORRECTIONS_LAYER_ID } from "../../../shared/config/layerIds.js";

import { createAttributeFilterService } from "./attributeFilterService.js";

const COMPATIBILITY_PROVIDER_ID = PRODUCT_CORRECTIONS_LAYER_ID;
const STATUSES = [
  { Id: 1, Name: "Idle" },
  { Id: 2, Name: "Error" },
];
const USAGES = [
  { Id: 1, Name: "Overview" },
  { Id: 2, Name: "General" },
];

describe("attributeFilterService", () => {
  it("keeps filter state and result counts isolated by source", () => {
    const service = createService();
    const compatibility = createCompatibilityLayer();
    const paper = createLayer("paper-charts-products", [
      { datasetName: "PAPER-1", status: "Draft" },
      { datasetName: "PAPER-2", status: "Published" },
    ]);
    const s102 = createLayer("s102-products", [
      { datasetName: "S102-1", status: "Ready" },
      { datasetName: "S102-2", status: "Review" },
    ]);

    replaceCompatibilityProvider(service, compatibility);
    service.replaceProvider({
      providerId: "paper-charts",
      sourceId: "paper-charts",
      generation: 1,
      layers: [paper],
      filterDefinitions: ["status"],
    });
    service.replaceProvider({
      providerId: "s102",
      sourceId: "s102",
      generation: 1,
      layers: [s102],
      filterDefinitions: ["status"],
    });

    service.setFilter("paper-charts", "status", ["Published"], 2);

    assert.equal(service.getLayerMetadata("paper-charts").visibleCount, 1);
    assert.equal(service.getLayerMetadata("s102").visibleCount, 2);
    assert.equal(service.getLayerMetadata(COMPATIBILITY_PROVIDER_ID).visibleCount, 1);
    assert.equal(service.matchesGraphic(s102.graphics.toArray()[0], s102), true);
  });

  it("uses compatibility defaults when no saved snapshot is applied", () => {
    const service = createService();
    replaceCompatibilityProvider(service, createCompatibilityLayer());

    assert.deepEqual([...service.getSelectedValues(COMPATIBILITY_PROVIDER_ID, "status")], ["2"]);
    assert.equal(service.getLayerMetadata(COMPATIBILITY_PROVIDER_ID).visibleCount, 1);
  });

  it("migrates an empty version 1 snapshot when a runtime source arrives first", () => {
    const service = createService();
    service.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [createLayer("paper-products", [{ status: "Published" }])],
      filterDefinitions: ["status"],
    });

    assert.equal(service.applyFilterSnapshot(createEmptyVersion1Snapshot()), true);
    replaceCompatibilityProvider(service, createCompatibilityLayer());

    assert.equal(service.getSelectedValues(COMPATIBILITY_PROVIDER_ID, "status"), null);
    assert.equal(service.getLayerMetadata(COMPATIBILITY_PROVIDER_ID).visibleCount, 2);
  });

  it("migrates an empty version 1 snapshot when compatibility AOI arrives first", () => {
    const service = createService();
    replaceCompatibilityProvider(service, createCompatibilityLayer());

    assert.deepEqual([...service.getSelectedValues(COMPATIBILITY_PROVIDER_ID, "status")], ["2"]);
    assert.equal(service.applyFilterSnapshot(createEmptyVersion1Snapshot()), true);

    assert.equal(service.getSelectedValues(COMPATIBILITY_PROVIDER_ID, "status"), null);
    assert.equal(service.getLayerMetadata(COMPATIBILITY_PROVIDER_ID).visibleCount, 2);
  });

  it("migrates active version 1 compatibility fields", () => {
    const service = createService();
    const applied = service.applyFilterSnapshot({
      version: 1,
      layers: [
        {
          layerId: COMPATIBILITY_PROVIDER_ID,
          fields: [{ fieldName: "Status", mode: "values", values: ["2"] }],
        },
      ],
    });
    replaceCompatibilityProvider(service, createCompatibilityLayer());

    assert.equal(applied, true);
    assert.deepEqual([...service.getSelectedValues(COMPATIBILITY_PROVIDER_ID, "status")], ["2"]);
    assert.equal(service.getLayerMetadata(COMPATIBILITY_PROVIDER_ID).visibleCount, 1);
  });

  it("rejects an invalid snapshot without replacing declarative defaults", () => {
    const service = createService();
    replaceCompatibilityProvider(service, createCompatibilityLayer());

    const applied = service.applyFilterSnapshot({
      version: 1,
      layers: [{ layerId: COMPATIBILITY_PROVIDER_ID }],
    });

    assert.equal(applied, false);
    assert.deepEqual([...service.getSelectedValues(COMPATIBILITY_PROVIDER_ID, "status")], ["2"]);
  });

  it("round-trips an explicit empty version 2 compatibility provider state", () => {
    const firstService = createService();
    assert.equal(
      firstService.applyFilterSnapshot({
        version: 2,
        sources: [{ providerId: COMPATIBILITY_PROVIDER_ID, fields: [] }],
      }),
      true
    );
    const snapshot = firstService.getFilterSnapshot();

    assert.deepEqual(snapshot, {
      version: 2,
      sources: [{ providerId: COMPATIBILITY_PROVIDER_ID, fields: [] }],
    });

    const secondService = createService();
    assert.equal(secondService.applyFilterSnapshot(snapshot), true);
    replaceCompatibilityProvider(secondService, createCompatibilityLayer());

    assert.equal(secondService.getSelectedValues(COMPATIBILITY_PROVIDER_ID, "status"), null);
    assert.equal(secondService.getLayerMetadata(COMPATIBILITY_PROVIDER_ID).visibleCount, 2);
  });

  it("keeps newer provider defaults independent from version 1 migration", () => {
    const service = createService();
    const paper = createLayer("paper-products", [{ status: "Draft" }, { status: "Published" }]);
    const s102 = createLayer("s102-products", [{ status: "Ready" }]);

    service.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [paper],
      filterDefinitions: ["status"],
      defaultExcludedValues: [{ fieldName: "status", values: ["Draft"] }],
    });
    service.replaceProvider({
      providerId: "s102",
      generation: 1,
      layers: [s102],
      filterDefinitions: ["status"],
    });

    assert.equal(service.applyFilterSnapshot(createEmptyVersion1Snapshot()), true);
    replaceCompatibilityProvider(service, createCompatibilityLayer());

    assert.deepEqual([...service.getSelectedValues("paper-charts", "status")], ["Published"]);
    assert.equal(service.getSelectedValues("s102", "status"), null);
    assert.equal(service.getSelectedValues(COMPATIBILITY_PROVIDER_ID, "status"), null);
  });

  it("does not reactivate compatibility defaults during provider refresh after migration", () => {
    const service = createService();
    assert.equal(service.applyFilterSnapshot(createEmptyVersion1Snapshot()), true);
    replaceCompatibilityProvider(service, createCompatibilityLayer(), 1);
    replaceCompatibilityProvider(service, createCompatibilityLayer(), 2);

    assert.equal(service.getSelectedValues(COMPATIBILITY_PROVIDER_ID, "status"), null);
    assert.equal(service.getLayerMetadata(COMPATIBILITY_PROVIDER_ID).visibleCount, 2);
  });

  it("removes runtime state on deactivation and starts from defaults on reactivation", () => {
    const service = createService();
    const paper = createLayer("paper-charts-products", [
      { datasetName: "PAPER-1", status: "Draft" },
      { datasetName: "PAPER-2", status: "Published" },
    ]);

    service.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [paper],
      filterDefinitions: ["status"],
    });
    service.setFilter("paper-charts", "status", ["Published"], 2);
    service.removeProvider("paper-charts", { generation: 2 });

    assert.equal(service.getLayerMetadata("paper-charts"), null);
    assert.equal(service.getActiveFilterCount("paper-charts"), 0);

    service.replaceProvider({
      providerId: "paper-charts",
      generation: 3,
      layers: [paper],
      filterDefinitions: ["status"],
      defaultExcludedValues: [{ fieldName: "status", values: ["Draft"] }],
    });
    assert.deepEqual([...service.getSelectedValues("paper-charts", "status")], ["Published"]);
    assert.equal(service.getLayerMetadata("paper-charts").visibleCount, 1);
  });

  it("rebuilds facets only for the replaced provider", () => {
    const service = createService();
    service.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [createLayer("paper", [{ status: "Draft" }])],
      filterDefinitions: ["status"],
    });
    service.replaceProvider({
      providerId: "s102",
      generation: 1,
      layers: [createLayer("s102", [{ status: "Ready" }])],
      filterDefinitions: ["status"],
    });

    service.replaceProvider({
      providerId: "paper-charts",
      generation: 2,
      layers: [createLayer("paper", [{ status: "Published" }])],
      filterDefinitions: ["status"],
    });

    assert.deepEqual(
      service.getValuesForField("paper-charts", "status").map((entry) => entry.value),
      ["Published"]
    );
    assert.deepEqual(
      service.getValuesForField("s102", "status").map((entry) => entry.value),
      ["Ready"]
    );
  });

  it("ignores unsupported optional attributes without crashing", () => {
    const service = createService();
    const s102 = createLayer("s102-products", [{ datasetName: "S102-1", status: "Ready" }]);

    service.replaceProvider({
      providerId: "s102",
      generation: 1,
      layers: [s102],
      filterDefinitions: ["status", "displayScale", "usageBand"],
    });

    assert.deepEqual(service.getFilterableFields("s102"), ["status"]);
    assert.equal(service.matchesGraphic(s102.graphics.toArray()[0], s102), true);
  });

  it("rejects stale facet publication after a newer source operation", () => {
    const service = createService();
    service.replaceProvider({
      providerId: "paper-charts",
      generation: 3,
      layers: [createLayer("paper", [{ status: "Current" }])],
      filterDefinitions: ["status"],
    });
    service.removeProvider("paper-charts", { generation: 4 });

    const stale = service.replaceProvider({
      providerId: "paper-charts",
      generation: 3,
      layers: [createLayer("paper", [{ status: "Stale" }])],
      filterDefinitions: ["status"],
    });

    assert.deepEqual(stale, { published: false, stale: true });
    assert.equal(service.getLayerMetadata("paper-charts"), null);
  });

  it("serializes source-aware filter state as version 2", () => {
    const service = createService();
    service.replaceProvider({
      providerId: "paper-charts",
      sourceId: "paper-charts",
      generation: 1,
      layers: [createLayer("paper", [{ status: "Draft" }, { status: "Published" }])],
      filterDefinitions: ["status"],
    });
    service.setFilter("paper-charts", "status", ["Published"], 2);

    assert.deepEqual(service.getFilterSnapshot(), {
      version: 2,
      sources: [
        {
          providerId: "paper-charts",
          fields: [{ fieldName: "status", mode: "values", values: ["Published"] }],
        },
      ],
    });
  });
  it("clears pending migrated compatibility filters before delayed publication", () => {
    const service = createService();
    const events = [];
    service.subscribe((detail) => events.push(detail));
    service.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [createLayer("paper-products", [{ status: "Published" }])],
      filterDefinitions: ["status"],
    });
    assert.equal(
      service.applyFilterSnapshot({
        version: 1,
        layers: [
          {
            layerId: COMPATIBILITY_PROVIDER_ID,
            fields: [{ fieldName: "status", mode: "values", values: ["2"] }],
          },
        ],
      }),
      true
    );

    assert.equal(service.clearAll(), true);
    assert.deepEqual(service.getFilterSnapshot(), {
      version: 2,
      sources: [
        { providerId: "paper-charts", fields: [] },
        { providerId: COMPATIBILITY_PROVIDER_ID, fields: [] },
      ],
    });
    assert.equal(events.at(-1)?.type, "filters-cleared");

    replaceCompatibilityProvider(service, createCompatibilityLayer(), 1);
    assert.equal(service.getSelectedValues(COMPATIBILITY_PROVIDER_ID, "status"), null);
    assert.equal(service.getLayerMetadata(COMPATIBILITY_PROVIDER_ID).visibleCount, 2);

    replaceCompatibilityProvider(service, createCompatibilityLayer(), 2);
    assert.equal(service.getSelectedValues(COMPATIBILITY_PROVIDER_ID, "status"), null);
    assert.equal(service.getLayerMetadata(COMPATIBILITY_PROVIDER_ID).visibleCount, 2);
  });

  it("reports Clear all changes when only pending filter values are removed", () => {
    const service = createService();
    assert.equal(
      service.applyFilterSnapshot({
        version: 2,
        sources: [
          {
            providerId: COMPATIBILITY_PROVIDER_ID,
            fields: [{ fieldName: "status", mode: "values", values: ["2"] }],
          },
        ],
      }),
      true
    );

    assert.equal(service.getActiveFilterCount(), 0);
    assert.equal(service.clearAll(), true);
    assert.deepEqual(service.getFilterSnapshot(), {
      version: 2,
      sources: [{ providerId: COMPATIBILITY_PROVIDER_ID, fields: [] }],
    });
    assert.equal(service.clearAll(), false);
  });

  it("removes pending source state and persisted intent before publication", () => {
    const service = createService();
    const events = [];
    service.subscribe((detail) => events.push(detail));
    assert.equal(
      service.applyFilterSnapshot({
        version: 2,
        sources: [
          {
            providerId: "paper-charts",
            fields: [{ fieldName: "status", mode: "values", values: ["Published"] }],
          },
        ],
      }),
      true
    );

    assert.deepEqual(service.removeProvider("paper-charts", { generation: 1 }), {
      removed: true,
      stale: false,
    });
    assert.deepEqual(service.getFilterSnapshot(), { version: 2, sources: [] });
    assert.equal(events.at(-1)?.type, "provider-removed");

    const paper = createLayer("paper-products", [{ status: "Draft" }, { status: "Published" }]);
    service.replaceProvider({
      providerId: "paper-charts",
      generation: 2,
      layers: [paper],
      filterDefinitions: ["status"],
      defaultExcludedValues: [{ fieldName: "status", values: ["Draft"] }],
    });

    assert.deepEqual([...service.getSelectedValues("paper-charts", "status")], ["Published"]);
    assert.equal(service.getLayerMetadata("paper-charts").visibleCount, 1);
  });

  it("clears pending empty intent on deactivation and restores provider defaults", () => {
    const service = createService();
    assert.equal(
      service.applyFilterSnapshot({
        version: 2,
        sources: [{ providerId: "s102", fields: [] }],
      }),
      true
    );

    assert.deepEqual(service.removeProvider("s102", { generation: 1 }), {
      removed: true,
      stale: false,
    });
    assert.deepEqual(service.getFilterSnapshot(), { version: 2, sources: [] });

    service.replaceProvider({
      providerId: "s102",
      generation: 2,
      layers: [createLayer("s102-products", [{ status: "Ready" }, { status: "Review" }])],
      filterDefinitions: ["status"],
      defaultExcludedValues: [{ fieldName: "status", values: ["Review"] }],
    });

    assert.deepEqual([...service.getSelectedValues("s102", "status")], ["Ready"]);
  });

  it("preserves pending persisted intent during temporary activation failure", () => {
    const service = createService();
    const snapshot = {
      version: 2,
      sources: [
        {
          providerId: "paper-charts",
          fields: [{ fieldName: "status", mode: "values", values: ["Published"] }],
        },
      ],
    };

    assert.equal(service.applyFilterSnapshot(snapshot), true);
    assert.deepEqual(service.suspendProvider("paper-charts", { generation: 1 }), {
      suspended: false,
      stale: false,
    });
    assert.deepEqual(service.getFilterSnapshot(), snapshot);
    assert.equal(service.getProviderGeneration("paper-charts"), 1);

    const stale = service.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [createLayer("paper-products", [{ status: "Published" }])],
      filterDefinitions: ["status"],
    });
    assert.deepEqual(stale, { published: false, stale: true });

    service.replaceProvider({
      providerId: "paper-charts",
      generation: 2,
      layers: [createLayer("paper-products", [{ status: "Draft" }, { status: "Published" }])],
      filterDefinitions: ["status"],
    });

    assert.deepEqual([...service.getSelectedValues("paper-charts", "status")], ["Published"]);
    assert.equal(service.getLayerMetadata("paper-charts").visibleCount, 1);
  });

  it("retains active filter intent when temporary suspension removes runtime state", () => {
    const service = createService();
    const layer = createLayer("paper-products", [{ status: "Draft" }, { status: "Published" }]);

    service.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [layer],
      filterDefinitions: ["status"],
    });
    service.setFilter("paper-charts", "status", ["Published"], 2);

    assert.deepEqual(service.suspendProvider("paper-charts", { generation: 2 }), {
      suspended: true,
      stale: false,
    });
    assert.equal(service.getLayerMetadata("paper-charts"), null);
    assert.deepEqual(service.getFilterSnapshot(), {
      version: 2,
      sources: [
        {
          providerId: "paper-charts",
          fields: [{ fieldName: "status", mode: "values", values: ["Published"] }],
        },
      ],
    });

    service.replaceProvider({
      providerId: "paper-charts",
      generation: 3,
      layers: [layer],
      filterDefinitions: ["status"],
    });
    assert.deepEqual([...service.getSelectedValues("paper-charts", "status")], ["Published"]);
  });
});

function createService() {
  return createAttributeFilterService({
    getStatuses: () => STATUSES,
    getUsages: () => USAGES,
  });
}

function createEmptyVersion1Snapshot() {
  return { version: 1, layers: [] };
}

function replaceCompatibilityProvider(service, layer, generation = 1) {
  return service.replaceProvider({
    providerId: COMPATIBILITY_PROVIDER_ID,
    generation,
    layers: [layer],
    filterDefinitions: ["status"],
    defaultExcludedValues: [{ fieldName: "status", values: ["1"] }],
    useLookupOptions: true,
  });
}

function createCompatibilityLayer() {
  return createLayer(COMPATIBILITY_PROVIDER_ID, [
    { datasetName: "AOI-1", status: 1 },
    { datasetName: "AOI-2", status: 2 },
  ]);
}

function createLayer(id, attributesList) {
  const graphics = attributesList.map((attributes) => ({ attributes: { ...attributes } }));
  const layer = {
    appLayerId: id,
    id,
    graphics: {
      toArray: () => graphics,
    },
  };
  graphics.forEach((graphic) => {
    graphic.layer = layer;
  });
  return layer;
}
