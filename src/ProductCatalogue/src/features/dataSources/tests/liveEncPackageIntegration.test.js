import assert from "node:assert/strict";
import test from "node:test";
import {
  createDataSourceRegistry,
  getRuntimeSelectableDataSources,
} from "../config/dataSourceRegistry.js";
import { normalizeDataSourcePayload } from "../services/dataSourceNormalizer.js";
import { createDataSourceLoader } from "../services/dataSourceLoader.js";
import { createAttributeFilterService } from "../../map/filters/attributeFilterService.js";
import { createSourceAwareProductSearchIndex } from "../../map/search/sourceAwareProductSearchIndex.js";
import { createDataSourceDerivedStateCoordinator } from "../services/dataSourceDerivedStateCoordinator.js";
import {
  resolveCorrectionSymbol,
  areCorrectionSymbolsEquivalent,
} from "../../map/symbology/correctionSymbolResolver.js";
import { getCorrectionSymbol } from "../../map/symbology/correctionSymbols.js";
import { reconcileGraphicsLayers } from "../../map/core/reconcileGraphicsLayers.js";
import { createDataSourceController } from "../services/dataSourceController.js";
import { createLiveEncAoi } from "./fixtures/liveEncAoi.js";

const registry = createDataSourceRegistry();
const source = registry.byId.get("s101");
const symbolization = source.layerDefinitions[0].symbolization;
const normalize = (payload) => normalizeDataSourcePayload(payload, source);
const attributesOf = (aoi) => normalize([aoi]).products[0];
const resolveSymbol = (attributes) =>
  resolveCorrectionSymbol({ attributes, geometry: { type: "polygon" }, symbolization });

function createLayer(payload) {
  const normalized = normalize(payload);
  const graphics = normalized.layers[0].data.features.map(({ attributes, geometry }) => ({
    attributes,
    geometry: { ...geometry, type: "polygon" },
    symbol: resolveSymbol(attributes),
  }));
  // Normalized products and layer attributes are the same application read model.
  const layer = {
    customId: "s101-products",
    appLayerId: "s101-products",
    layerType: "graphics",
    appLayerKind: "electronic-products",
    title: source.label,
    appSymbolization: symbolization,
    appLayerCapabilities: { supportsAttributeFilters: true, supportsProductSearch: true },
    graphics,
    _index: new Map(graphics.map((graphic) => [graphic.attributes.featureKey, graphic])),
  };
  graphics.forEach((graphic) => {
    graphic.layer = layer;
  });
  return layer;
}

test("one selectable Main-map provider makes exactly one live ENC AOI request", async () => {
  const calls = [];
  const load = createDataSourceLoader({
    get: async (...args) => {
      calls.push(args);
      return [];
    },
  });
  for (const provider of getRuntimeSelectableDataSources(registry)) await load(provider);
  assert.deepEqual(
    calls.map(([path]) => path),
    ["electronicproducts/aoi?layer=ENC"]
  );
  await assert.rejects(load(registry.byId.get("s57")), /no loader/);
});

test("live DTO maps representative geometry, scalar fields and authoritative ordered members", () => {
  const raw = createLiveEncAoi();
  const result = normalize([raw]);
  const attributes = result.products[0];
  assert.equal(attributes.datasetName, raw.Attributes.DatasetName);
  assert.equal(attributes.productKey, raw.Attributes.DatasetName);
  assert.equal(attributes.status, 9);
  assert.equal(attributes.displayScale, 25000);
  assert.equal(attributes.usageBand, 3);
  assert.equal(attributes.errorMessage, "Representative error");
  assert.deepEqual(result.layers[0].data.features[0].geometry, JSON.parse(raw.Geometry));
  assert.deepEqual(attributes.workUnitStatus, {
    workflowStatus: 9,
    members: [
      { key: "s101", datasetName: "101DK0041149E", status: 10 },
      { key: "s57", datasetName: "DK-WIRE-MAPPING-42", status: 15 },
    ],
  });
  assert.equal(attributes.Package, undefined);
  assert.equal(attributes.package, undefined);
  assert.equal(result.products.length, 1);
});

test("camelCase aliases and numeric strings normalize identically", () => {
  function camel(value) {
    if (Array.isArray(value)) return value.map(camel);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key[0].toLowerCase() + key.slice(1), camel(item)])
    );
  }
  const raw = createLiveEncAoi();
  const aliases = camel(raw);
  aliases.attributes.status = "9";
  aliases.attributes.package.s101.status = "10";
  aliases.attributes.package.s57.status = "15";
  assert.deepEqual(attributesOf(aliases), attributesOf(raw));
});

test("registry declarations own member order and transport mapping without source-name branching", () => {
  const renamed = {
    ...source,
    id: "renamed-provider",
    label: "Other label",
    workUnit: {
      ...source.workUnit,
      primaryMemberKey: "primary",
      members: [{ key: "secondary" }, { key: "primary" }],
    },
    normalizer: {
      ...source.normalizer,
      packageMembers: {
        primary: { field: "S101", specification: 1 },
        secondary: { field: "S57", specification: 0 },
      },
    },
  };
  const result = normalizeDataSourcePayload([createLiveEncAoi()], renamed);
  assert.deepEqual(
    result.products[0].workUnitStatus.members.map(({ key, status }) => [key, status]),
    [
      ["secondary", 15],
      ["primary", 10],
    ]
  );
});

test("missing or unknown member state keeps representative scalar fallback", () => {
  for (const mutate of [
    (raw) => {
      delete raw.Attributes.Package;
    },
    (raw) => {
      delete raw.Attributes.Package.S57;
    },
    (raw) => {
      delete raw.Attributes.Package.S57.DatasetName;
    },
    (raw) => {
      raw.Attributes.Package.S57.Status = 999;
    },
    (raw) => {
      raw.Attributes.Package.S101.Status = null;
    },
  ]) {
    const raw = createLiveEncAoi();
    mutate(raw);
    const attributes = attributesOf(raw);
    assert.equal(attributes.workUnitStatus, undefined);
    assert.deepEqual(resolveSymbol(attributes), getCorrectionSymbol(9));
    const values = source.filtering.definitions[0].readValues(
      { attributes },
      () => attributes.status
    );
    assert.deepEqual(values.map(String), ["9"]);
  }
});

test("contradictory package identities and malformed geometry fail the complete payload", () => {
  for (const mutate of [
    (raw) => {
      raw.Attributes.Package.SourceDatasetName = "OTHER";
    },
    (raw) => {
      raw.Attributes.Package.S101.DatasetName = "OTHER";
    },
    (raw) => {
      raw.Attributes.Package.S57.DatasetName = raw.Attributes.DatasetName;
    },
    (raw) => {
      raw.Attributes.Package.S57.ProductSpecification = 1;
    },
    (raw) => {
      raw.Attributes.Package.Layer = 2;
    },
  ]) {
    const raw = createLiveEncAoi();
    mutate(raw);
    assert.throws(() => normalize([createLiveEncAoi(), raw]), /contradictory/);
  }
  assert.throws(() => normalize([{ ...createLiveEncAoi(), Geometry: "invalid" }]));
  assert.throws(
    () => normalize([{ ...createLiveEncAoi(), Geometry: {} }]),
    /invalid Esri geometry/
  );
});

test("live equal members render scalar and mixed members render CIM independently of workflow", () => {
  const equal = attributesOf(createLiveEncAoi({ s101Status: 11, s57Status: 11 }));
  assert.deepEqual(resolveSymbol(equal), getCorrectionSymbol(11));
  const mixed = attributesOf(createLiveEncAoi());
  assert.equal(resolveSymbol(mixed).type, "cim");
  const workflowOnly = createLiveEncAoi({ workflowStatus: 5 });
  workflowOnly.Attributes.Package.Status = 5;
  assert.ok(
    areCorrectionSymbolsEquivalent(resolveSymbol(mixed), resolveSymbol(attributesOf(workflowOnly)))
  );
});

test("normalized live payload feeds F1 OR matching, F3 self-excluding counts and one search item", () => {
  const payload = [
    createLiveEncAoi(),
    createLiveEncAoi({
      datasetName: "SECOND",
      s57DatasetName: "MAPPED-SECOND",
      workflowStatus: 11,
      s101Status: 11,
      s57Status: 11,
      usageBand: 4,
      displayScale: 50000,
    }),
  ];
  const layer = createLayer(payload);
  const service = createAttributeFilterService({
    getStatuses: () => [9, 10, 11, 15].map((Id) => ({ Id, Name: String(Id) })),
    getUsages: () => [],
  });
  const search = createSourceAwareProductSearchIndex();
  const handlers = new Map();
  const coordinator = createDataSourceDerivedStateCoordinator({
    lifecycle: {
      subscribe(event, handler) {
        handlers.set(event, handler);
        return () => handlers.delete(event);
      },
    },
    filterService: service,
    productSearchIndex: search,
  });
  handlers.get("activated")({ source, sourceId: source.id, generation: 1, layers: [layer] });
  const counts = () =>
    Object.fromEntries(
      service.getValuesForField(source.id, "status").map(({ value, count }) => [value, count])
    );
  assert.deepEqual(counts(), { 9: 1, 10: 1, 11: 1, 15: 1 });
  assert.equal(search.getEntries().length, 2);
  for (const status of [9, 10, 15]) {
    service.setFilter(source.id, "status", [String(status)], 4);
    assert.equal(service.getLayerMetadata(source.id).visibleCount, 1);
    assert.equal(service.matchesGraphic(layer.graphics[0], layer), true);
  }
  service.setFilter(source.id, "usageBand", ["4"], 2);
  assert.deepEqual(counts(), { 9: 0, 10: 0, 11: 1, 15: 0 });
  assert.equal(service.getLayerMetadata(source.id).visibleCount, 0);
  service.setFilter(source.id, "status", ["11"], 4);
  assert.equal(service.getLayerMetadata(source.id).visibleCount, 1);
  service.setRangeFilter(source.id, "displayScale", 25000, 25000, 25000, 50000);
  assert.deepEqual(counts(), { 9: 0, 10: 0, 11: 0, 15: 0 });
  assert.equal(service.getLayerMetadata(source.id).visibleCount, 0);
  service.clearAll(source.id);
  const updated = createLayer([createLiveEncAoi({ s57Status: 11 })]);
  handlers.get("refreshed")({ source, sourceId: source.id, generation: 2, layers: [updated] });
  assert.equal(search.getEntries().length, 1);
  assert.equal(service.getLayerMetadata(source.id).totalCount, 1);
  assert.deepEqual(counts(), { 9: 1, 10: 1, 11: 1, 15: 0 });
  coordinator.destroy();
});

test("live refresh preserves representative Graphic identity and no-op symbol reference", () => {
  const layer = createLayer([createLiveEncAoi()]);
  const graphic = layer.graphics[0];
  const symbol = graphic.symbol;
  const unchanged = reconcileGraphicsLayers({
    currentLayers: [layer],
    candidateLayers: [createLayer([createLiveEncAoi()])],
  });
  assert.equal(unchanged.updatedGraphicsCount, 0);
  assert.equal(graphic.symbol, symbol);
  const workflowOnly = reconcileGraphicsLayers({
    currentLayers: [layer],
    candidateLayers: [createLayer([createLiveEncAoi({ workflowStatus: 5 })])],
  });
  assert.equal(workflowOnly.updatedGraphicsCount, 1);
  assert.equal(graphic.symbol, symbol);
  const changed = reconcileGraphicsLayers({
    currentLayers: [layer],
    candidateLayers: [createLayer([createLiveEncAoi({ s57Status: 11 })])],
  });
  assert.equal(changed.success, true);
  assert.equal(layer.graphics[0], graphic);
  assert.equal(layer.graphics.length, 1);
  assert.equal(graphic.attributes.workUnitStatus.members[1].status, 11);
  assert.notDeepEqual(graphic.symbol, symbol);
});

test("superseded source generation cannot publish older live package member state", async () => {
  const deferred = [];
  let committed;
  const controller = createDataSourceController({
    registry,
    persistence: {
      read: () => ({ enabledSourceIds: ["s101"], status: "valid" }),
      write: () => true,
    },
    loadSource: () => new Promise((resolve) => deferred.push(resolve)),
    normalizeSource: normalizeDataSourcePayload,
    mapAdapter: {
      prepareSource: async ({ source, normalized, generation }) => ({
        sourceId: source.id,
        normalized,
        generation,
        layers: [],
        committed: false,
      }),
      commitSource(candidate, { isCurrent }) {
        if (!isCurrent()) return { committed: false };
        committed = candidate.normalized.products[0];
        candidate.committed = true;
        return { committed: true, layers: [], hoverReady: Promise.resolve() };
      },
      discardCandidate() {},
      removeSource() {},
      getSourceLayers: () => [],
    },
  });
  const first = controller.initialize();
  deferred[0]([createLiveEncAoi()]);
  await first;
  const older = controller.refreshActive();
  const newer = controller.refreshActive();
  deferred[2]([createLiveEncAoi({ s57Status: 11 })]);
  await newer;
  deferred[1]([createLiveEncAoi({ s57Status: 7 })]);
  await older;
  assert.equal(committed.workUnitStatus.members[1].status, 11);
  assert.deepEqual(controller.getActiveSourceIds(), ["s101"]);
  controller.destroy();
});
