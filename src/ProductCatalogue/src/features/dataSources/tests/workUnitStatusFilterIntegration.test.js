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

test("packages filter only by aggregate status and ordinary products remain scalar", () => {
  const registry = createDataSourceRegistry({ isDevelopment: true });
  const pkg = registry.byId.get("s101");
  const simple = registry.byId.get("paper-charts");
  assert.equal(pkg.filtering.definitions[0].fieldName, "packageStatus");
  assert.equal(typeof pkg.filtering.definitions[0].readValues, "function");
  assert.deepEqual(simple.filtering.definitions, ["status", "displayScale", "usageBand"]);

  const filterService = createAttributeFilterService({
    getStatuses: () => [],
    getUsages: () => [],
  });
  const searchIndex = createSourceAwareProductSearchIndex();
  const listeners = new Map();
  const coordinator = createDataSourceDerivedStateCoordinator({
    lifecycle: {
      subscribe(event, handler) {
        listeners.set(event, handler);
        return () => listeners.delete(event);
      },
    },
    filterService,
    productSearchIndex: searchIndex,
  });
  const original = createLayer({
    datasetName: "P1",
    productKey: "P1",
    status: 11,
    workUnitStatus: {
      packageStatus: 4,
      workflowStatus: 11,
      members: [
        { key: "s101", status: 15 },
        { key: "s57", status: 11 },
      ],
    },
  });
  listeners.get("activated")({
    source: pkg,
    sourceId: pkg.id,
    generation: 1,
    layers: [original.layer],
  });
  const values = () =>
    Object.fromEntries(
      filterService
        .getValuesForField(pkg.id, "packageStatus")
        .map(({ value, count }) => [value, count])
    );
  assert.equal(values()["4"], 1);
  assert.equal(filterService.getValuesForField(pkg.id, "status").length, 0);
  assert.equal(searchIndex.getEntries().length, 1);

  filterService.setFilter(pkg.id, "packageStatus", ["4"], 5);
  assert.equal(filterService.matchesGraphic(original.graphic, original.layer), true);
  filterService.setFilter(pkg.id, "packageStatus", ["2"], 5);
  assert.equal(filterService.matchesGraphic(original.graphic, original.layer), false);

  const changedMembers = createLayer({
    ...original.graphic.attributes,
    status: 15,
    workUnitStatus: {
      packageStatus: 4,
      workflowStatus: 15,
      members: [
        { key: "s101", status: 2 },
        { key: "s57", status: 2 },
      ],
    },
  });
  listeners.get("refreshed")({
    source: pkg,
    sourceId: pkg.id,
    generation: 2,
    layers: [changedMembers.layer],
  });
  assert.equal(values()["4"], 1);
  assert.equal(filterService.matchesGraphic(changedMembers.graphic, changedMembers.layer), false);
  filterService.setFilter(pkg.id, "packageStatus", ["4"], 5);
  assert.equal(filterService.matchesGraphic(changedMembers.graphic, changedMembers.layer), true);

  const unknown = createLayer({ datasetName: "P1", productKey: "P1", status: 15 });
  listeners.get("refreshed")({
    source: pkg,
    sourceId: pkg.id,
    generation: 3,
    layers: [unknown.layer],
  });
  assert.equal(filterService.matchesGraphic(unknown.graphic, unknown.layer), false);
  assert.equal(values().unknown, 1);

  const ordinary = createLayer({
    datasetName: "S1",
    productKey: "S1",
    status: 11,
    workUnitStatus: { packageStatus: 4, members: [{ status: 15 }] },
  });
  listeners.get("activated")({
    source: simple,
    sourceId: simple.id,
    generation: 1,
    layers: [ordinary.layer],
  });
  assert.deepEqual(
    filterService.getValuesForField(simple.id, "status").map(({ value, count }) => [value, count]),
    [["11", 1]]
  );
  assert.equal(filterService.getValuesForField(simple.id, "packageStatus").length, 0);
  coordinator.destroy();
});
