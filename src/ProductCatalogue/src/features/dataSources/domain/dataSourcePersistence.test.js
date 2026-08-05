import assert from "node:assert/strict";
import test from "node:test";

import { DATA_SOURCE_IDS, createDataSourceRegistry } from "../config/dataSourceRegistry.js";
import {
  DATA_SOURCE_STORAGE_KEY,
  createDataSourcePersistence,
  readDataSourceSelection,
} from "./dataSourcePersistence.js";

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    writes,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      const serialized = String(value);
      writes.push({ key, value: serialized });
      values.set(key, serialized);
    },
    removeItem(key) {
      values.delete(key);
    },
    readJson(key) {
      const value = values.get(key);
      return value ? JSON.parse(value) : null;
    },
    readRaw(key) {
      return values.get(key) ?? null;
    },
  };
}

const developmentRegistry = createDataSourceRegistry({ isDevelopment: true });
const productionRegistry = createDataSourceRegistry({ isDevelopment: false });

test("first visit deterministically enables all configured and available sources", () => {
  const result = readDataSourceSelection({
    storage: createMemoryStorage(),
    registry: developmentRegistry,
  });

  assert.equal(result.status, "missing");
  assert.equal(result.isFirstVisit, true);
  assert.equal(result.shouldPersist, true);
  assert.equal(result.hasRuntimeSelectableSources, true);
  assert.deepEqual(result.enabledSourceIds, [DATA_SOURCE_IDS.PAPER_CHARTS, DATA_SOURCE_IDS.S102]);
});

test("missing storage with zero runtime-selectable sources does not create initialized state", () => {
  const storage = createMemoryStorage();
  const persistence = createDataSourcePersistence({ storage });
  const result = persistence.read(productionRegistry);

  assert.equal(result.status, "missing");
  assert.equal(result.isFirstVisit, true);
  assert.equal(result.shouldPersist, false);
  assert.equal(result.hasRuntimeSelectableSources, false);
  assert.deepEqual(result.enabledSourceIds, []);
  assert.equal(persistence.write(productionRegistry, []), true);
  assert.equal(storage.readRaw(DATA_SOURCE_STORAGE_KEY), null);
  assert.equal(storage.writes.length, 0);
});

test("a later deployment with selectable sources still applies first-visit defaults", () => {
  const storage = createMemoryStorage();
  const persistence = createDataSourcePersistence({ storage });

  persistence.write(productionRegistry, []);
  const laterResult = persistence.read(developmentRegistry);

  assert.equal(laterResult.status, "missing");
  assert.equal(laterResult.isFirstVisit, true);
  assert.deepEqual(laterResult.enabledSourceIds, ["paper-charts", "s102"]);
});

test("valid persisted state wins over registry defaults", () => {
  const storage = createMemoryStorage({
    [DATA_SOURCE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      initialized: true,
      enabledSourceIds: [DATA_SOURCE_IDS.S102],
    }),
  });

  const result = readDataSourceSelection({ storage, registry: developmentRegistry });
  assert.equal(result.status, "valid");
  assert.deepEqual(result.enabledSourceIds, [DATA_SOURCE_IDS.S102]);
  assert.equal(result.isFirstVisit, false);
});

test("an explicit all-off choice remains valid when choices were available", () => {
  const storage = createMemoryStorage();
  const persistence = createDataSourcePersistence({ storage });

  assert.equal(persistence.write(developmentRegistry, []), true);
  const result = persistence.read(developmentRegistry);

  assert.equal(result.status, "valid");
  assert.equal(result.isFirstVisit, false);
  assert.deepEqual(result.enabledSourceIds, []);
  assert.deepEqual(storage.readJson(DATA_SOURCE_STORAGE_KEY), {
    schemaVersion: 1,
    initialized: true,
    enabledSourceIds: [],
  });
});

test("temporary total unavailability does not overwrite a previous valid selection", () => {
  const storage = createMemoryStorage();
  const persistence = createDataSourcePersistence({ storage });

  persistence.write(developmentRegistry, [DATA_SOURCE_IDS.S102]);
  const original = storage.readRaw(DATA_SOURCE_STORAGE_KEY);
  const unavailableResult = persistence.read(productionRegistry);
  persistence.write(productionRegistry, []);

  assert.deepEqual(unavailableResult.enabledSourceIds, []);
  assert.deepEqual(unavailableResult.preservedUnavailableSourceIds, [DATA_SOURCE_IDS.S102]);
  assert.equal(storage.readRaw(DATA_SOURCE_STORAGE_KEY), original);
});

test("known temporarily unavailable IDs survive writes for still-selectable sources", () => {
  const storage = createMemoryStorage({
    [DATA_SOURCE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      initialized: true,
      enabledSourceIds: [DATA_SOURCE_IDS.S102],
    }),
  });
  const persistence = createDataSourcePersistence({ storage });
  const paperOnlyRegistry = createDataSourceRegistry({
    isDevelopment: true,
    configuredSourceIds: [DATA_SOURCE_IDS.PAPER_CHARTS],
  });

  persistence.write(paperOnlyRegistry, [DATA_SOURCE_IDS.PAPER_CHARTS]);

  assert.deepEqual(storage.readJson(DATA_SOURCE_STORAGE_KEY), {
    schemaVersion: 1,
    initialized: true,
    enabledSourceIds: [DATA_SOURCE_IDS.PAPER_CHARTS, DATA_SOURCE_IDS.S102],
  });
});

test("invalid JSON and unsupported schema fail safely to deployment defaults", () => {
  const invalidJson = readDataSourceSelection({
    storage: createMemoryStorage({ [DATA_SOURCE_STORAGE_KEY]: "{" }),
    registry: developmentRegistry,
  });
  const unsupported = readDataSourceSelection({
    storage: createMemoryStorage({
      [DATA_SOURCE_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 999,
        initialized: true,
        enabledSourceIds: [],
      }),
    }),
    registry: developmentRegistry,
  });

  assert.equal(invalidJson.status, "invalid-json");
  assert.equal(unsupported.status, "unsupported-version");
  assert.deepEqual(invalidJson.enabledSourceIds, ["paper-charts", "s102"]);
  assert.deepEqual(unsupported.enabledSourceIds, ["paper-charts", "s102"]);
});

test("unknown IDs are ignored while known unavailable IDs retain migration intent", () => {
  const storage = createMemoryStorage({
    [DATA_SOURCE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      initialized: true,
      enabledSourceIds: ["unknown", "s57", "paper-charts"],
    }),
  });

  const result = readDataSourceSelection({ storage, registry: developmentRegistry });
  assert.deepEqual(result.enabledSourceIds, ["paper-charts"]);
  assert.deepEqual(result.preservedUnavailableSourceIds, ["s57"]);
  assert.equal(result.shouldPersist, true);
});

test("a new registry source stays disabled for an existing valid user state", () => {
  const storage = createMemoryStorage({
    [DATA_SOURCE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      initialized: true,
      enabledSourceIds: [DATA_SOURCE_IDS.PAPER_CHARTS],
    }),
  });
  const expandedRegistry = createDataSourceRegistry({ isDevelopment: true });

  const result = readDataSourceSelection({ storage, registry: expandedRegistry });
  assert.deepEqual(result.enabledSourceIds, [DATA_SOURCE_IDS.PAPER_CHARTS]);
});

test("persistence writes only known source intent and never creates enc-products state", () => {
  const storage = createMemoryStorage();
  const persistence = createDataSourcePersistence({ storage });

  assert.equal(
    persistence.write(developmentRegistry, ["enc-products", "s57", "paper-charts", "s102"]),
    true
  );
  assert.deepEqual(storage.readJson(DATA_SOURCE_STORAGE_KEY), {
    schemaVersion: 1,
    initialized: true,
    enabledSourceIds: ["paper-charts", "s102"],
  });
  assert.equal(storage.readJson("enc-products"), null);
});
