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

const electronicRegistry = createDataSourceRegistry({
  configuredSourceIds: [DATA_SOURCE_IDS.S57, DATA_SOURCE_IDS.S101],
});
const s101OnlyRegistry = createDataSourceRegistry({
  configuredSourceIds: [DATA_SOURCE_IDS.S101],
});
const unavailableElectronicRegistry = createDataSourceRegistry({ configuredSourceIds: [] });
const mockFixtureRegistry = createDataSourceRegistry({
  configuredSourceIds: [DATA_SOURCE_IDS.PAPER_CHARTS, DATA_SOURCE_IDS.S102],
  isDevelopment: true,
});
const retiredMockRegistry = createDataSourceRegistry({
  configuredSourceIds: [DATA_SOURCE_IDS.PAPER_CHARTS, DATA_SOURCE_IDS.S102],
  isDevelopment: false,
});

test("first visit deterministically enables all configured and available electronic sources", () => {
  const result = readDataSourceSelection({
    storage: createMemoryStorage(),
    registry: electronicRegistry,
  });

  assert.equal(result.status, "missing");
  assert.equal(result.isFirstVisit, true);
  assert.equal(result.shouldPersist, true);
  assert.equal(result.hasRuntimeSelectableSources, true);
  assert.deepEqual(result.enabledSourceIds, [DATA_SOURCE_IDS.S57, DATA_SOURCE_IDS.S101]);
});

test("missing storage with zero runtime-selectable sources does not create initialized state", () => {
  const storage = createMemoryStorage();
  const persistence = createDataSourcePersistence({ storage });
  const result = persistence.read(retiredMockRegistry);

  assert.equal(result.status, "missing");
  assert.equal(result.isFirstVisit, true);
  assert.equal(result.shouldPersist, false);
  assert.equal(result.hasRuntimeSelectableSources, false);
  assert.deepEqual(result.enabledSourceIds, []);
  assert.equal(persistence.write(retiredMockRegistry, []), true);
  assert.equal(storage.readRaw(DATA_SOURCE_STORAGE_KEY), null);
  assert.equal(storage.writes.length, 0);
});

test("non-persistable mock fixtures stay session-only and do not create stored selection", () => {
  const storage = createMemoryStorage();
  const persistence = createDataSourcePersistence({ storage });
  const result = persistence.read(mockFixtureRegistry);

  assert.deepEqual(result.enabledSourceIds, [DATA_SOURCE_IDS.PAPER_CHARTS, DATA_SOURCE_IDS.S102]);
  assert.equal(result.shouldPersist, false);
  assert.equal(
    persistence.write(mockFixtureRegistry, [DATA_SOURCE_IDS.PAPER_CHARTS, DATA_SOURCE_IDS.S102]),
    true
  );
  assert.equal(storage.readRaw(DATA_SOURCE_STORAGE_KEY), null);
});

test("a later deployment with selectable sources still applies first-visit defaults", () => {
  const storage = createMemoryStorage();
  const persistence = createDataSourcePersistence({ storage });

  persistence.write(retiredMockRegistry, []);
  const laterResult = persistence.read(electronicRegistry);

  assert.equal(laterResult.status, "missing");
  assert.equal(laterResult.isFirstVisit, true);
  assert.deepEqual(laterResult.enabledSourceIds, [DATA_SOURCE_IDS.S57, DATA_SOURCE_IDS.S101]);
});

test("valid persisted electronic state wins over registry defaults", () => {
  const storage = createMemoryStorage({
    [DATA_SOURCE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 2,
      initialized: true,
      enabledSourceIds: [DATA_SOURCE_IDS.S101],
    }),
  });

  const result = readDataSourceSelection({ storage, registry: electronicRegistry });
  assert.equal(result.status, "valid");
  assert.deepEqual(result.enabledSourceIds, [DATA_SOURCE_IDS.S101]);
  assert.equal(result.isFirstVisit, false);
});

test("an explicit all-off electronic choice remains valid when choices were available", () => {
  const storage = createMemoryStorage();
  const persistence = createDataSourcePersistence({ storage });

  assert.equal(persistence.write(electronicRegistry, []), true);
  const result = persistence.read(electronicRegistry);

  assert.equal(result.status, "valid");
  assert.equal(result.isFirstVisit, false);
  assert.deepEqual(result.enabledSourceIds, []);
  assert.deepEqual(storage.readJson(DATA_SOURCE_STORAGE_KEY), {
    schemaVersion: 2,
    initialized: true,
    enabledSourceIds: [],
  });
});

test("temporary total electronic unavailability does not overwrite previous selection intent", () => {
  const storage = createMemoryStorage();
  const persistence = createDataSourcePersistence({ storage });

  persistence.write(electronicRegistry, [DATA_SOURCE_IDS.S57]);
  const original = storage.readRaw(DATA_SOURCE_STORAGE_KEY);
  const unavailableResult = persistence.read(unavailableElectronicRegistry);
  persistence.write(unavailableElectronicRegistry, []);

  assert.deepEqual(unavailableResult.enabledSourceIds, []);
  assert.deepEqual(unavailableResult.preservedUnavailableSourceIds, [DATA_SOURCE_IDS.S57]);
  assert.equal(storage.readRaw(DATA_SOURCE_STORAGE_KEY), original);
});

test("known temporarily unavailable electronic IDs survive writes for still-selectable sources", () => {
  const storage = createMemoryStorage({
    [DATA_SOURCE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 2,
      initialized: true,
      enabledSourceIds: [DATA_SOURCE_IDS.S57],
    }),
  });
  const persistence = createDataSourcePersistence({ storage });

  persistence.write(s101OnlyRegistry, [DATA_SOURCE_IDS.S101]);

  assert.deepEqual(storage.readJson(DATA_SOURCE_STORAGE_KEY), {
    schemaVersion: 2,
    initialized: true,
    enabledSourceIds: [DATA_SOURCE_IDS.S57, DATA_SOURCE_IDS.S101],
  });
});

test("retired Paper Charts and S-102 IDs are removed while electronic intent is preserved", () => {
  const storage = createMemoryStorage({
    [DATA_SOURCE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 2,
      initialized: true,
      enabledSourceIds: [
        DATA_SOURCE_IDS.PAPER_CHARTS,
        DATA_SOURCE_IDS.S57,
        DATA_SOURCE_IDS.S102,
        DATA_SOURCE_IDS.S101,
      ],
    }),
  });
  const persistence = createDataSourcePersistence({ storage });
  const result = persistence.read(s101OnlyRegistry);

  assert.deepEqual(result.enabledSourceIds, [DATA_SOURCE_IDS.S101]);
  assert.deepEqual(result.preservedUnavailableSourceIds, [DATA_SOURCE_IDS.S57]);
  assert.equal(result.shouldPersist, true);

  persistence.write(s101OnlyRegistry, result.enabledSourceIds);
  assert.deepEqual(storage.readJson(DATA_SOURCE_STORAGE_KEY), {
    schemaVersion: 2,
    initialized: true,
    enabledSourceIds: [DATA_SOURCE_IDS.S57, DATA_SOURCE_IDS.S101],
  });
});

test("retired fixture-only persisted state is cleaned even when no source is selectable", () => {
  const storage = createMemoryStorage({
    [DATA_SOURCE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 2,
      initialized: true,
      enabledSourceIds: [DATA_SOURCE_IDS.PAPER_CHARTS, DATA_SOURCE_IDS.S102],
    }),
  });
  const persistence = createDataSourcePersistence({ storage });
  const result = persistence.read(retiredMockRegistry);

  assert.deepEqual(result.enabledSourceIds, []);
  assert.deepEqual(result.preservedUnavailableSourceIds, []);
  assert.equal(result.shouldPersist, true);

  persistence.write(retiredMockRegistry, result.enabledSourceIds);
  assert.deepEqual(storage.readJson(DATA_SOURCE_STORAGE_KEY), {
    schemaVersion: 2,
    initialized: true,
    enabledSourceIds: [],
  });
});

test("invalid JSON and unsupported schema fail safely to deployment defaults", () => {
  const invalidJson = readDataSourceSelection({
    storage: createMemoryStorage({ [DATA_SOURCE_STORAGE_KEY]: "{" }),
    registry: electronicRegistry,
  });
  const unsupported = readDataSourceSelection({
    storage: createMemoryStorage({
      [DATA_SOURCE_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 999,
        initialized: true,
        enabledSourceIds: [],
      }),
    }),
    registry: electronicRegistry,
  });

  assert.equal(invalidJson.status, "invalid-json");
  assert.equal(unsupported.status, "unsupported-version");
  assert.deepEqual(invalidJson.enabledSourceIds, [DATA_SOURCE_IDS.S57, DATA_SOURCE_IDS.S101]);
  assert.deepEqual(unsupported.enabledSourceIds, [DATA_SOURCE_IDS.S57, DATA_SOURCE_IDS.S101]);
});

test("unknown and retired IDs are ignored while known unavailable electronic IDs retain intent", () => {
  const storage = createMemoryStorage({
    [DATA_SOURCE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 2,
      initialized: true,
      enabledSourceIds: [
        "unknown",
        DATA_SOURCE_IDS.S57,
        DATA_SOURCE_IDS.PAPER_CHARTS,
        DATA_SOURCE_IDS.S101,
      ],
    }),
  });

  const result = readDataSourceSelection({ storage, registry: s101OnlyRegistry });
  assert.deepEqual(result.enabledSourceIds, [DATA_SOURCE_IDS.S101]);
  assert.deepEqual(result.preservedUnavailableSourceIds, [DATA_SOURCE_IDS.S57]);
  assert.equal(result.shouldPersist, true);
});

test("a new electronic registry source stays disabled for an existing valid user state", () => {
  const storage = createMemoryStorage({
    [DATA_SOURCE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 2,
      initialized: true,
      enabledSourceIds: [DATA_SOURCE_IDS.S101],
    }),
  });

  const result = readDataSourceSelection({ storage, registry: electronicRegistry });
  assert.deepEqual(result.enabledSourceIds, [DATA_SOURCE_IDS.S101]);
});

test("persistence writes only persistable known source intent and never creates enc-products state", () => {
  const storage = createMemoryStorage();
  const persistence = createDataSourcePersistence({ storage });

  assert.equal(
    persistence.write(electronicRegistry, [
      "enc-products",
      DATA_SOURCE_IDS.S57,
      DATA_SOURCE_IDS.PAPER_CHARTS,
      DATA_SOURCE_IDS.S101,
      DATA_SOURCE_IDS.S102,
    ]),
    true
  );
  assert.deepEqual(storage.readJson(DATA_SOURCE_STORAGE_KEY), {
    schemaVersion: 2,
    initialized: true,
    enabledSourceIds: [DATA_SOURCE_IDS.S57, DATA_SOURCE_IDS.S101],
  });
  assert.equal(storage.readJson("enc-products"), null);
});
