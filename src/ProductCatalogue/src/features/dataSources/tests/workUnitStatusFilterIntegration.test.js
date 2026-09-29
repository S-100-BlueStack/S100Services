import assert from "node:assert/strict";
import { test } from "node:test";
import { createDataSourceRegistry } from "../config/dataSourceRegistry.js";
import { createDataSourceDerivedStateCoordinator } from "../services/dataSourceDerivedStateCoordinator.js";
import { createAttributeFilterService } from "../../map/filters/attributeFilterService.js";
import { createSourceAwareProductSearchIndex } from "../../map/search/sourceAwareProductSearchIndex.js";

function createLayer(attributes) {
  const graphic = { attributes };
  const layer = {
    appLayerCapabilities: { supportsAttributeFilters: true, supportsProductSearch: true },
    graphics: { toArray: () => [graphic] },
  };
  graphic.layer = layer;
  return { graphic, layer };
}

test("package source opts in while simple source remains scalar", () => {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  const pkg = registry.byId.get("s101");
  const simple = registry.byId.get("paper-charts");
  assert.equal(typeof pkg.filtering.definitions[0].readValues, "function");
  assert.deepEqual(simple.filtering.definitions, ["status", "displayScale", "usageBand"]);
  assert.equal(pkg.workUnit.kind, "package");

  const filterService = createAttributeFilterService({
    getStatuses: () => [],
    getUsages: () => [],
  });
  const searchIndex = createSourceAwareProductSearchIndex();
  const listeners = new Map();
  const lifecycle = {
    subscribe(event, handler) {
      listeners.set(event, handler);
      return () => listeners.delete(event);
    },
  };
  const coordinator = createDataSourceDerivedStateCoordinator({
    lifecycle,
    filterService,
    productSearchIndex: searchIndex,
  });
  const baseline = createLayer({ datasetName: "P1", productKey: "P1", status: "R" });
  listeners.get("activated")({
    source: pkg,
    sourceId: pkg.id,
    generation: 1,
    layers: [baseline.layer],
  });
  assert.equal(
    filterService.getValuesForField(pkg.id, "status").find((entry) => entry.value === "R").count,
    1
  );
  assert.equal(filterService.getLayerMetadata(pkg.id).totalCount, 1);
  assert.equal(searchIndex.getEntries().length, 1);
  filterService.setFilter(
    pkg.id,
    "status",
    ["R"],
    filterService.getValuesForField(pkg.id, "status").length
  );
  assert.equal(filterService.matchesGraphic(baseline.graphic, baseline.layer), true);

  const enriched = createLayer({
    datasetName: "P1",
    productKey: "P1",
    status: "R",
    workUnitStatus: {
      workflowStatus: "W",
      members: [
        { key: "arbitrary-one", status: "M" },
        { key: "arbitrary-two", status: "M" },
      ],
    },
  });
  listeners.get("refreshed")({
    source: pkg,
    sourceId: pkg.id,
    generation: 2,
    layers: [enriched.layer],
  });
  assert.equal(
    filterService.getValuesForField(pkg.id, "status").find((entry) => entry.value === "M").count,
    1
  );
  filterService.setFilter(
    pkg.id,
    "status",
    ["M"],
    filterService.getValuesForField(pkg.id, "status").length
  );
  assert.equal(filterService.getLayerMetadata(pkg.id).visibleCount, 1);
  assert.equal(searchIndex.getEntries().length, 1);
  filterService.setFilter(
    pkg.id,
    "status",
    ["W"],
    filterService.getValuesForField(pkg.id, "status").length
  );
  assert.equal(filterService.getLayerMetadata(pkg.id).visibleCount, 1);

  const ordinary = createLayer({
    datasetName: "S1",
    productKey: "S1",
    status: "R",
    workUnitStatus: {
      workflowStatus: "W",
      members: [{ key: "arbitrary", status: "M" }],
    },
  });
  listeners.get("activated")({
    source: simple,
    sourceId: simple.id,
    generation: 1,
    layers: [ordinary.layer],
  });
  assert.equal(
    filterService.getValuesForField(simple.id, "status").some((entry) => entry.value === "M"),
    false
  );
  assert.equal(
    filterService.getValuesForField(simple.id, "status").find((entry) => entry.value === "R").count,
    1
  );
  coordinator.destroy();
});
