import assert from "node:assert/strict";
import test from "node:test";
import { createAttributeFilterService } from "./attributeFilterService.js";
import { readWorkUnitStatusFilterValues } from "../../dataSources/domain/workUnitStatusProjection.js";
import { getNumericEntries, getRangeState } from "./attributeFilterCounts.js";

const definitions = [
  { fieldName: "status", readValues: readWorkUnitStatusFilterValues },
  "usageBand",
  "displayScale",
];

function fixture({ defaults = false } = {}) {
  const service = createAttributeFilterService({
    getStatuses: () => [
      { Id: "Ready", Name: "Ready label" },
      { Id: "Error", Name: "Error label" },
      { Id: "Idle", Name: "Idle label" },
    ],
    getUsages: () => [],
  });
  const attributes = [
    {
      status: "Representative",
      workUnitStatus: {
        workflowStatus: "Ready",
        members: [{ status: "Ready" }, { status: "Error" }],
      },
      usageBand: "Coastal",
      displayScale: 1000,
    },
    {
      status: "Representative",
      workUnitStatus: { members: [{ status: "Ready" }, { status: "Ready" }] },
      usageBand: "Overview",
      displayScale: 2000,
    },
    { status: "Scalar", usageBand: "Coastal", displayScale: 3000 },
  ];
  const layer = { graphics: attributes.map((attributes) => ({ attributes })) };
  const publish = (providerId = "packages", generation = 1, layers = [layer]) =>
    service.replaceProvider({
      providerId,
      generation,
      layers,
      filterDefinitions: definitions,
      useLookupOptions: true,
      defaultExcludedValues: defaults ? [{ fieldName: "status", values: ["Idle"] }] : [],
    });
  publish();
  return { service, layer, publish };
}

function counts(service, fieldName, providerId = "packages") {
  return Object.fromEntries(
    service.getValuesForField(providerId, fieldName).map(({ value, count }) => [value, count])
  );
}

function assertCounts(service, status, usageBand, displayScale) {
  assert.deepEqual(counts(service, "status"), { ...status, Idle: 0 });
  assert.deepEqual(counts(service, "usageBand"), usageBand);
  assert.deepEqual(counts(service, "displayScale"), displayScale);
}

test("self-excluding facets AND other dimensions and retain zero-count domains", () => {
  const { service } = fixture();
  const base = service.getValuesForField("packages", "status");
  assert.deepEqual(
    base.map(({ value, label }) => [value, label]),
    [
      ["Ready", "Ready label"],
      ["Error", "Error label"],
      ["Idle", "Idle label"],
      ["Scalar", "Scalar"],
    ]
  );
  assertCounts(
    service,
    { Ready: 2, Error: 1, Scalar: 1 },
    { Coastal: 2, Overview: 1 },
    { 1000: 1, 2000: 1, 3000: 1 }
  );

  service.setFilter("packages", "usageBand", ["Coastal"], 2);
  assertCounts(
    service,
    { Ready: 1, Error: 1, Scalar: 1 },
    { Coastal: 2, Overview: 1 },
    { 1000: 1, 2000: 0, 3000: 1 }
  );

  service.setFilter("packages", "status", ["Ready"], base.length);
  assertCounts(
    service,
    { Ready: 1, Error: 1, Scalar: 1 },
    { Coastal: 1, Overview: 1 },
    { 1000: 1, 2000: 0, 3000: 0 }
  );

  service.setRangeFilter("packages", "displayScale", 1500, 3000, 1000, 3000);
  assertCounts(
    service,
    { Ready: 0, Error: 0, Scalar: 1 },
    { Coastal: 0, Overview: 1 },
    { 1000: 1, 2000: 0, 3000: 0 }
  );
  assert.deepEqual(
    service.getValuesForField("packages", "status").map(({ value, label }) => [value, label]),
    base.map(({ value, label }) => [value, label])
  );
  assert.equal(service.getLayerMetadata("packages").visibleCount, 0);
  assert.equal(service.getLayerMetadata("packages").totalCount, 3);
  service.clearAll();
  assert.deepEqual(service.getValuesForField("packages", "status"), base);
});

test("range domain ignores its own range and previews include the other dimensions", () => {
  const { service } = fixture();
  service.setRangeFilter("packages", "displayScale", 2000, 3000, 1000, 3000);
  assert.deepEqual(counts(service, "displayScale"), { 1000: 1, 2000: 1, 3000: 1 });
  assert.equal(
    getRangeState(
      getNumericEntries(service.getValuesForField("packages", "displayScale")),
      1,
      2,
      "displayScale"
    ).featureCount,
    2
  );
  service.setFilter("packages", "status", ["Ready"], 4);
  assert.deepEqual(counts(service, "displayScale"), { 1000: 1, 2000: 1, 3000: 0 });
  assert.equal(
    getRangeState(
      getNumericEntries(service.getValuesForField("packages", "displayScale")),
      1,
      2,
      "displayScale"
    ).featureCount,
    1
  );
  service.setFilter("packages", "usageBand", ["Coastal"], 2);
  assert.deepEqual(counts(service, "displayScale"), { 1000: 1, 2000: 0, 3000: 0 });
  assert.equal(
    getRangeState(
      getNumericEntries(service.getValuesForField("packages", "displayScale")),
      1,
      2,
      "displayScale"
    ).featureCount,
    0
  );
});

test("workflow/member alternatives stay ORed and scalar fallback stays truthful", () => {
  const { service, layer } = fixture();
  service.setFilter("packages", "status", ["Error", "Scalar"], 4);
  assert.deepEqual(
    layer.graphics.map((graphic) => service.matchesGraphic(graphic, layer)),
    [true, false, true]
  );
  assert.deepEqual(counts(service, "status"), { Ready: 2, Error: 1, Idle: 0, Scalar: 1 });
  service.setFilter("packages", "usageBand", ["Overview"], 2);
  assert.deepEqual(counts(service, "status"), { Ready: 1, Error: 0, Idle: 0, Scalar: 0 });
  service.clearFilter("packages", "usageBand");
  assert.deepEqual(counts(service, "status"), { Ready: 2, Error: 1, Idle: 0, Scalar: 1 });
});

test("provider-local counts do not inherit another provider's filters", () => {
  const { service, publish } = fixture();
  publish("other");
  const base = service.getValuesForField("other", "status");
  service.setFilter("packages", "usageBand", [], 2);
  service.setRangeFilter("packages", "displayScale", 2000, 3000, 1000, 3000);
  assert.deepEqual(service.getValuesForField("other", "status"), base);
  assert.equal(service.getLayerMetadata("other").visibleCount, 3);
});

test("replacement and suspension derive fresh counts while respecting generation and pending intent", () => {
  const { service, publish } = fixture();
  service.setFilter("packages", "usageBand", ["Coastal"], 2);
  const replacement = {
    graphics: [{ attributes: { status: "Future", usageBand: "Coastal", displayScale: 4000 } }],
  };
  assert.equal(publish("packages", 2, [replacement]).published, true);
  assert.deepEqual(counts(service, "status"), { Ready: 0, Error: 0, Idle: 0, Future: 1 });
  assert.deepEqual(counts(service, "displayScale"), { 4000: 1 });
  assert.equal(publish("packages", 1).stale, true);
  assert.equal(service.removeProvider("packages", { generation: 1 }).stale, true);
  const snapshot = service.getFilterSnapshot();
  service.suspendProvider("packages", { generation: 3 });
  assert.deepEqual(service.getValuesForField("packages", "status"), []);
  assert.deepEqual(service.getFilterSnapshot(), snapshot);
  assert.equal(publish("packages", 3).stale, true);
  publish("packages", 4);
  assert.deepEqual(counts(service, "status"), { Ready: 1, Error: 1, Idle: 0, Scalar: 1 });
  service.removeProvider("packages", { generation: 5 });
  assert.deepEqual(service.getFilterSnapshot().sources, []);
  assert.equal(publish("packages", 5).stale, true);
});

test("contextual counts never enter the version 2 value/range snapshot", () => {
  const { service } = fixture();
  service.setFilter("packages", "status", ["Ready"], 4);
  service.setRangeFilter("packages", "displayScale", 1500, 3000, 1000, 3000);
  const snapshot = service.getFilterSnapshot();
  assert.deepEqual(snapshot, {
    version: 2,
    sources: [
      {
        providerId: "packages",
        fields: [
          { fieldName: "status", mode: "values", values: ["Ready"] },
          { fieldName: "displayScale", mode: "range", min: 1500, max: 3000 },
        ],
      },
    ],
  });
  service.getValuesForField("packages", "status")[0].count = 999;
  assert.deepEqual(service.getFilterSnapshot(), snapshot);
  const restored = fixture().service;
  assert.equal(restored.applyFilterSnapshot(snapshot), true);
  assert.deepEqual(restored.getFilterSnapshot(), snapshot);
  for (const field of ["status", "usageBand", "displayScale"]) {
    assert.deepEqual(
      restored.getValuesForField("packages", field),
      service.getValuesForField("packages", field)
    );
  }
});

test("Clear all and Reset derive counts from distinct unfiltered/default intent", () => {
  const { service } = fixture({ defaults: true });
  service.setFilter("packages", "status", ["Error"], 4);
  assert.deepEqual(counts(service, "usageBand"), { Coastal: 1, Overview: 0 });
  service.clearAll();
  assert.deepEqual(service.getFilterSnapshot().sources[0].fields, []);
  assert.deepEqual(counts(service, "usageBand"), { Coastal: 2, Overview: 1 });
  service.resetToDefaults();
  assert.deepEqual(
    [...service.getSelectedValues("packages", "status")],
    ["Ready", "Error", "Scalar"]
  );
  assert.deepEqual(counts(service, "usageBand"), { Coastal: 2, Overview: 1 });
});
