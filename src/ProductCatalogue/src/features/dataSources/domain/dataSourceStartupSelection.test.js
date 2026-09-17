import assert from "node:assert/strict";
import test from "node:test";

import { resolveStartupDataSourceSelection } from "./dataSourceStartupSelection.js";

function createSource(id, { persistSelection = true } = {}) {
  return { id, persistence: { persistSelection } };
}

function createPersistedSelection(enabledSourceIds, overrides = {}) {
  return {
    status: "valid",
    enabledSourceIds,
    isFirstVisit: false,
    ...overrides,
  };
}

test("missing persisted state preserves existing session-only first-visit defaults", () => {
  const result = resolveStartupDataSourceSelection({
    persistedSelection: createPersistedSelection(["fixture-a", "fixture-b"], {
      status: "missing",
      isFirstVisit: true,
    }),
    runtimeSelectableSources: [
      createSource("fixture-a", { persistSelection: false }),
      createSource("fixture-b", { persistSelection: false }),
    ],
    defaultEnabledSourceIds: ["fixture-a", "fixture-b"],
  });

  assert.deepEqual(result.enabledSourceIds, ["fixture-a", "fixture-b"]);
  assert.equal(result.recoveredFromEmpty, false);
});

test("valid non-empty restored selections remain unchanged", () => {
  assert.deepEqual(
    resolveStartupDataSourceSelection({
      persistedSelection: createPersistedSelection(["source-b"]),
    }).enabledSourceIds,
    ["source-b"]
  );
  assert.deepEqual(
    resolveStartupDataSourceSelection({
      persistedSelection: createPersistedSelection(["source-a", "source-b"]),
    }).enabledSourceIds,
    ["source-a", "source-b"]
  );
});

test("explicit empty restored state selects exactly one registry default", () => {
  const result = resolveStartupDataSourceSelection({
    persistedSelection: createPersistedSelection([]),
    runtimeSelectableSources: [
      createSource("source-a"),
      createSource("source-b"),
      createSource("source-c"),
    ],
    defaultEnabledSourceIds: ["source-b", "source-c"],
  });

  assert.deepEqual(result.enabledSourceIds, ["source-b"]);
  assert.equal(result.fallbackSourceId, "source-b");
  assert.equal(result.recoveredFromEmpty, true);
});

test("restored empty state ignores a runtime-selectable session-only source", () => {
  const result = resolveStartupDataSourceSelection({
    persistedSelection: createPersistedSelection([]),
    runtimeSelectableSources: [createSource("fixture", { persistSelection: false })],
    defaultEnabledSourceIds: ["fixture"],
  });

  assert.deepEqual(result.enabledSourceIds, []);
  assert.equal(result.fallbackSourceId, null);
  assert.equal(result.recoveredFromEmpty, false);
});

test("restored empty state remains empty when every runtime source is session-only", () => {
  const result = resolveStartupDataSourceSelection({
    persistedSelection: createPersistedSelection([]),
    runtimeSelectableSources: [
      createSource("fixture-a", { persistSelection: false }),
      createSource("fixture-b", { persistSelection: false }),
    ],
    defaultEnabledSourceIds: ["fixture-a", "fixture-b"],
  });

  assert.deepEqual(result.enabledSourceIds, []);
  assert.equal(result.recoveredFromEmpty, false);
});

test("restored empty state skips a session-only default before a persistable source", () => {
  const result = resolveStartupDataSourceSelection({
    persistedSelection: createPersistedSelection([]),
    runtimeSelectableSources: [
      createSource("fixture", { persistSelection: false }),
      createSource("persistent"),
    ],
    defaultEnabledSourceIds: ["fixture", "persistent"],
  });

  assert.deepEqual(result.enabledSourceIds, ["persistent"]);
  assert.equal(result.fallbackSourceId, "persistent");
  assert.equal(result.recoveredFromEmpty, true);
});

test("registry order provides a deterministic fallback when no source is a default", () => {
  const result = resolveStartupDataSourceSelection({
    persistedSelection: createPersistedSelection([]),
    runtimeSelectableSources: [createSource("source-a"), createSource("source-b")],
  });

  assert.deepEqual(result.enabledSourceIds, ["source-a"]);
});

test("unavailable sources are ineligible and cannot block an available fallback", () => {
  const result = resolveStartupDataSourceSelection({
    persistedSelection: createPersistedSelection([]),
    runtimeSelectableSources: [createSource("source-b")],
    defaultEnabledSourceIds: ["source-a", "source-b"],
  });

  assert.deepEqual(result.enabledSourceIds, ["source-b"]);
});

test("zero available sources remains a truthful empty startup selection", () => {
  const result = resolveStartupDataSourceSelection({
    persistedSelection: createPersistedSelection([]),
    runtimeSelectableSources: [],
    defaultEnabledSourceIds: ["source-a"],
  });

  assert.deepEqual(result.enabledSourceIds, []);
  assert.equal(result.fallbackSourceId, null);
  assert.equal(result.recoveredFromEmpty, false);
});

test("invalid persisted state keeps the persistence layer's existing fallback behavior", () => {
  const result = resolveStartupDataSourceSelection({
    persistedSelection: createPersistedSelection(["source-a", "source-b"], {
      status: "invalid-json",
    }),
  });

  assert.deepEqual(result.enabledSourceIds, ["source-a", "source-b"]);
  assert.equal(result.recoveredFromEmpty, false);
});
