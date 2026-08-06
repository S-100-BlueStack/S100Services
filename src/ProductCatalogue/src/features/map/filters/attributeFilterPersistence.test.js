import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PRODUCT_CORRECTIONS_LAYER_ID } from "../../../shared/config/layerIds.js";

import { createAttributeFilterService } from "./attributeFilterService.js";
import {
  ATTRIBUTE_FILTER_SNAPSHOT_READ_STATUS,
  readAttributeFilterSnapshot,
  removeAttributeFilterSnapshot,
  writeAttributeFilterSnapshot,
} from "./attributeFilterPersistence.js";

const STORAGE_KEY = "pc.attributeFilters.v3";
const COMPATIBILITY_PROVIDER_ID = PRODUCT_CORRECTIONS_LAYER_ID;

describe("attributeFilterPersistence", () => {
  it("canonicalizes an empty version 1 snapshot before delayed AOI publication", () => {
    const storage = createMemoryStorage({
      [STORAGE_KEY]: JSON.stringify({ version: 1, layers: [] }),
    });
    const service = createService();
    service.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [createLayer("paper-products", [{ status: "Published" }])],
      filterDefinitions: ["status"],
    });

    const saved = readAttributeFilterSnapshot({ storage });
    assert.equal(saved.status, ATTRIBUTE_FILTER_SNAPSHOT_READ_STATUS.PARSED);
    assert.equal(service.applyFilterSnapshot(saved.snapshot), true);
    assert.deepEqual(writeAttributeFilterSnapshot(service, { storage }), {
      written: true,
      error: null,
    });

    assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), {
      version: 2,
      sources: [
        { providerId: "paper-charts", fields: [] },
        { providerId: COMPATIBILITY_PROVIDER_ID, fields: [] },
      ],
    });

    replaceCompatibilityProvider(service, 1);
    assert.equal(service.getSelectedValues(COMPATIBILITY_PROVIDER_ID, "status"), null);
  });

  it("round-trips canonical state without depending on provider startup order", () => {
    const storage = createMemoryStorage({
      [STORAGE_KEY]: JSON.stringify({ version: 1, layers: [] }),
    });
    const firstService = createService();
    const saved = readAttributeFilterSnapshot({ storage });

    firstService.replaceProvider({
      providerId: "s102",
      generation: 1,
      layers: [createLayer("s102-products", [{ status: "Ready" }])],
      filterDefinitions: ["status"],
    });
    assert.equal(firstService.applyFilterSnapshot(saved.snapshot), true);
    writeAttributeFilterSnapshot(firstService, { storage });

    const secondService = createService();
    const canonical = readAttributeFilterSnapshot({ storage });
    assert.equal(secondService.applyFilterSnapshot(canonical.snapshot), true);
    replaceCompatibilityProvider(secondService, 1);

    assert.equal(secondService.getSelectedValues(COMPATIBILITY_PROVIDER_ID, "status"), null);
    assert.equal(secondService.getLayerMetadata(COMPATIBILITY_PROVIDER_ID).visibleCount, 2);
  });

  it("distinguishes missing and malformed persisted state", () => {
    const missingStorage = createMemoryStorage();
    const invalidStorage = createMemoryStorage({ [STORAGE_KEY]: "{invalid json" });

    const missing = readAttributeFilterSnapshot({ storage: missingStorage });
    const invalid = readAttributeFilterSnapshot({ storage: invalidStorage });

    assert.equal(missing.status, ATTRIBUTE_FILTER_SNAPSHOT_READ_STATUS.MISSING);
    assert.equal(missing.exists, false);
    assert.equal(invalid.status, ATTRIBUTE_FILTER_SNAPSHOT_READ_STATUS.INVALID);
    assert.equal(invalid.exists, true);
    assert.equal(invalid.snapshot, null);

    const removal = removeAttributeFilterSnapshot({ storage: invalidStorage });
    assert.deepEqual(removal, { removed: true, error: null });
    assert.equal(invalidStorage.getItem(STORAGE_KEY), null);
  });

  it("persists an explicit empty pending AOI state after a global filter reset", () => {
    const storage = createMemoryStorage({
      [STORAGE_KEY]: JSON.stringify({
        version: 1,
        layers: [
          {
            layerId: COMPATIBILITY_PROVIDER_ID,
            fields: [{ fieldName: "status", mode: "values", values: ["2"] }],
          },
        ],
      }),
    });
    const service = createService();
    service.replaceProvider({
      providerId: "paper-charts",
      generation: 1,
      layers: [createLayer("paper-products", [{ status: "Published" }])],
      filterDefinitions: ["status"],
    });

    const saved = readAttributeFilterSnapshot({ storage });
    assert.equal(service.applyFilterSnapshot(saved.snapshot), true);
    assert.equal(service.clearAll(), true);
    assert.deepEqual(writeAttributeFilterSnapshot(service, { storage }), {
      written: true,
      error: null,
    });
    assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), {
      version: 2,
      sources: [
        { providerId: "paper-charts", fields: [] },
        { providerId: COMPATIBILITY_PROVIDER_ID, fields: [] },
      ],
    });

    replaceCompatibilityProvider(service, 1);
    assert.equal(service.getSelectedValues(COMPATIBILITY_PROVIDER_ID, "status"), null);
    assert.equal(service.getLayerMetadata(COMPATIBILITY_PROVIDER_ID).visibleCount, 2);
  });

  it("does not persist a pending source filter after pre-publication deactivation", () => {
    const storage = createMemoryStorage({
      [STORAGE_KEY]: JSON.stringify({
        version: 2,
        sources: [
          {
            providerId: "s102",
            fields: [{ fieldName: "status", mode: "values", values: ["Ready"] }],
          },
        ],
      }),
    });
    const service = createService();
    const saved = readAttributeFilterSnapshot({ storage });

    assert.equal(service.applyFilterSnapshot(saved.snapshot), true);
    assert.deepEqual(service.removeProvider("s102", { generation: 1 }), {
      removed: true,
      stale: false,
    });
    writeAttributeFilterSnapshot(service, { storage });
    assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), {
      version: 2,
      sources: [],
    });

    service.replaceProvider({
      providerId: "s102",
      generation: 2,
      layers: [createLayer("s102-products", [{ status: "Ready" }, { status: "Review" }])],
      filterDefinitions: ["status"],
      defaultExcludedValues: [{ fieldName: "status", values: ["Review"] }],
    });
    assert.deepEqual([...service.getSelectedValues("s102", "status")], ["Ready"]);
  });

  it("does not persist temporary activation failure as provider removal", () => {
    const persistedSnapshot = {
      version: 2,
      sources: [
        {
          providerId: "paper-charts",
          fields: [{ fieldName: "status", mode: "values", values: ["Error"] }],
        },
      ],
    };
    const storage = createMemoryStorage({
      [STORAGE_KEY]: JSON.stringify(persistedSnapshot),
    });
    const service = createService();
    const saved = readAttributeFilterSnapshot({ storage });

    assert.equal(service.applyFilterSnapshot(saved.snapshot), true);
    assert.deepEqual(service.suspendProvider("paper-charts", { generation: 1 }), {
      suspended: false,
      stale: false,
    });
    assert.deepEqual(writeAttributeFilterSnapshot(service, { storage }), {
      written: true,
      error: null,
    });
    assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), persistedSnapshot);

    service.replaceProvider({
      providerId: "paper-charts",
      generation: 2,
      layers: [createLayer("paper-products", [{ status: "Error" }, { status: "Published" }])],
      filterDefinitions: ["status"],
    });
    assert.deepEqual([...service.getSelectedValues("paper-charts", "status")], ["Error"]);
  });
});

function createService() {
  return createAttributeFilterService({
    getStatuses: () => [
      { Id: 1, Name: "Idle" },
      { Id: 2, Name: "Error" },
    ],
    getUsages: () => [],
  });
}

function replaceCompatibilityProvider(service, generation) {
  service.replaceProvider({
    providerId: COMPATIBILITY_PROVIDER_ID,
    generation,
    layers: [
      createLayer(COMPATIBILITY_PROVIDER_ID, [
        { datasetName: "AOI-1", status: 1 },
        { datasetName: "AOI-2", status: 2 },
      ]),
    ],
    filterDefinitions: ["status"],
    defaultExcludedValues: [{ fieldName: "status", values: ["1"] }],
    useLookupOptions: true,
  });
}

function createMemoryStorage(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
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
