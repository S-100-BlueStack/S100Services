import assert from "node:assert/strict";
import test from "node:test";

import {
  readStoredThemeMode,
  resolveThemeStorage,
  writeStoredThemeMode,
} from "./themeStorage.js";

const CURRENT_KEY = "data-catalogue:theme-mode";
const LEGACY_KEY = "job-manager:theme-mode";

function createStorage(values = {}) {
  const data = new Map(Object.entries(values));
  const writes = [];

  return {
    data,
    writes,
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      writes.push([key, value]);
      data.set(key, value);
    },
  };
}

test("saved DataCatalogue theme takes precedence over the pre-rename preference", () => {
  const storage = createStorage({ [CURRENT_KEY]: "light", [LEGACY_KEY]: "dark" });

  assert.equal(readStoredThemeMode(storage), "light");
  assert.deepEqual(storage.writes, []);
});

test("pre-rename light and dark themes are migrated without deleting the legacy value", () => {
  for (const mode of ["light", "dark"]) {
    const storage = createStorage({ [LEGACY_KEY]: mode });

    assert.equal(readStoredThemeMode(storage), mode);
    assert.equal(storage.data.get(CURRENT_KEY), mode);
    assert.equal(storage.data.get(LEGACY_KEY), mode);
    assert.equal(readStoredThemeMode(storage), mode);
    assert.deepEqual(storage.writes, [[CURRENT_KEY, mode]]);
  }
});

test("a valid legacy preference can replace an invalid renamed preference", () => {
  const storage = createStorage({ [CURRENT_KEY]: "invalid", [LEGACY_KEY]: "dark" });

  assert.equal(readStoredThemeMode(storage), "dark");
  assert.deepEqual(storage.writes, [[CURRENT_KEY, "dark"]]);
});

test("missing or invalid preferences leave system theme fallback available", () => {
  for (const values of [{}, { [LEGACY_KEY]: "invalid" }, { [CURRENT_KEY]: "invalid" }]) {
    const storage = createStorage(values);
    assert.equal(readStoredThemeMode(storage), null);
    assert.deepEqual(storage.writes, []);
  }
});

test("a failed migration write still returns the existing preference", () => {
  const storage = {
    getItem: (key) => (key === LEGACY_KEY ? "dark" : null),
    setItem() {
      throw new Error("Storage is full");
    },
  };

  assert.equal(readStoredThemeMode(storage), "dark");
});

test("new writes only target the DataCatalogue preference key", () => {
  const storage = createStorage({ [LEGACY_KEY]: "dark" });

  writeStoredThemeMode(storage, "light");

  assert.deepEqual(storage.writes, [[CURRENT_KEY, "light"]]);
  assert.equal(storage.data.get(LEGACY_KEY), "dark");
  assert.equal(readStoredThemeMode(storage), "light");
});

test("unavailable storage reads and writes do not throw", () => {
  const restrictedStorage = {
    getItem() {
      throw new Error("Storage access denied");
    },
    setItem() {
      throw new Error("Storage access denied");
    },
  };

  for (const storage of [null, undefined, restrictedStorage]) {
    assert.equal(readStoredThemeMode(storage), null);
    assert.doesNotThrow(() => writeStoredThemeMode(storage, "dark"));
  }
});

test("storage resolution tolerates a missing browser or denied localStorage getter", () => {
  const restrictedHost = {
    window: {
      get localStorage() {
        throw new Error("Storage access denied");
      },
    },
  };
  const storage = createStorage();

  assert.equal(resolveThemeStorage({}), null);
  assert.equal(resolveThemeStorage(restrictedHost), null);
  assert.equal(resolveThemeStorage({ window: { localStorage: storage } }), storage);
});

test("stored theme values are normalized using the existing theme domain rules", () => {
  const storage = createStorage({ [LEGACY_KEY]: " dark " });

  assert.equal(readStoredThemeMode(storage), "dark");
  assert.deepEqual(storage.writes, [[CURRENT_KEY, "dark"]]);
});
