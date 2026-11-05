import assert from "node:assert/strict";
import test from "node:test";
import {
  BASEMAP_OPTIONS,
  BASEMAP_SELECTION_STORAGE_KEY,
  DEFAULT_BASEMAP,
  DEFAULT_DARK_BASEMAP,
  createBasemapSettings,
} from "./basemapSettings.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function preferenceHarness() {
  let enabled = true;
  const listeners = new Set();
  return {
    canPersist: () => enabled,
    onPersistenceChanged(callback) {
      listeners.add(callback);
      return { remove: () => listeners.delete(callback) };
    },
    setEnabled(next) {
      enabled = next;
      for (const listener of listeners) listener(next);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

test("Basemap options are available across themes; key-only styles are gated", () => {
  assert.deepEqual(
    BASEMAP_OPTIONS.map(({ id }) => id),
    ["topo-vector", "oceans", "dark-gray-vector", "arcgis/human-geography-dark"]
  );
  const withoutKey = createBasemapSettings({ storage: null });
  assert.equal(withoutKey.getOptions().length, 3);
  assert.equal(withoutKey.setValue("arcgis/human-geography-dark"), false);
  assert.equal(withoutKey.setValue("unknown-style"), false);
  assert.equal(withoutKey.getValue(), DEFAULT_BASEMAP);
  withoutKey.destroy();

  const withKey = createBasemapSettings({ apiKey: "  browser-key  ", storage: null });
  assert.equal(withKey.getOptions().length, 4);
  assert.equal(withKey.setValue("arcgis/human-geography-dark"), true);
  withKey.destroy();
});

test("Theme selects an automatic default until manual selection; maps share one choice", () => {
  const storage = memoryStorage();
  const settings = createBasemapSettings({ storage, apiKey: "browser-key" });
  const mapA = { basemap: { id: DEFAULT_BASEMAP } };
  const mapB = {};
  const detachA = settings.registerMap(mapA);
  settings.registerMap(mapB);
  assert.equal(settings.getValue(), DEFAULT_BASEMAP);
  assert.equal(mapB.basemap, DEFAULT_BASEMAP);
  assert.deepEqual(settings.isCustom(), false);
  const initialBasemap = mapA.basemap;
  settings.setThemeMode("light");
  assert.equal(mapA.basemap, initialBasemap, "no-op theme updates must not reload the map");
  settings.setThemeMode("dark");
  assert.equal(mapA.basemap, DEFAULT_DARK_BASEMAP);
  assert.equal(mapB.basemap, DEFAULT_DARK_BASEMAP);
  assert.equal(settings.setValue("oceans"), true);
  assert.equal(settings.isCustom(), true);
  settings.setThemeMode("light");
  settings.setThemeMode("dark");
  assert.equal(mapA.basemap, "oceans", "manual basemap survives light/dark toggles");
  assert.equal(mapB.basemap, "oceans");
  assert.deepEqual(JSON.parse(storage.getItem(BASEMAP_SELECTION_STORAGE_KEY)), {
    manualId: "oceans",
  });
  const restored = createBasemapSettings({ storage, themeMode: "dark" });
  assert.equal(restored.getValue(), "oceans");
  restored.destroy();
  settings.resetToThemeDefault();
  assert.equal(mapA.basemap, DEFAULT_DARK_BASEMAP);
  assert.equal(storage.getItem(BASEMAP_SELECTION_STORAGE_KEY), null);
  detachA();
  settings.setValue("topo-vector");
  assert.equal(mapA.basemap, DEFAULT_DARK_BASEMAP);
  settings.destroy();
});

test("Auto-save opt-out clears storage while preserving the current session", () => {
  const storage = memoryStorage();
  const preferences = preferenceHarness();
  const settings = createBasemapSettings({ storage, ...preferences });
  settings.setValue("oceans");
  preferences.setEnabled(false);
  assert.equal(settings.getValue(), "oceans");
  assert.equal(storage.getItem(BASEMAP_SELECTION_STORAGE_KEY), null);
  settings.setThemeMode("dark");
  assert.equal(settings.getValue(), "oceans");
  preferences.setEnabled(true);
  assert.deepEqual(JSON.parse(storage.getItem(BASEMAP_SELECTION_STORAGE_KEY)), {
    manualId: "oceans",
  });
  settings.resetToThemeDefault();
  assert.equal(settings.getValue(), DEFAULT_DARK_BASEMAP);
  settings.destroy();
  assert.equal(preferences.listenerCount, 0);
});

test("Unavailable saved basemaps and inaccessible storage fail closed", () => {
  const storage = memoryStorage({
    [BASEMAP_SELECTION_STORAGE_KEY]: JSON.stringify({ manualId: "arcgis/human-geography-dark" }),
  });
  const withoutKey = createBasemapSettings({ storage, themeMode: "dark" });
  assert.equal(withoutKey.getValue(), DEFAULT_DARK_BASEMAP);
  assert.equal(withoutKey.isCustom(), false);
  withoutKey.destroy();

  const brokenStorage = {
    getItem() {
      throw new Error("Storage denied");
    },
    setItem() {
      throw new Error("Storage denied");
    },
    removeItem() {
      throw new Error("Storage denied");
    },
  };
  const settings = createBasemapSettings({ storage: brokenStorage });
  const map = {};
  const detach = settings.registerMap(map);
  let changes = 0;
  const unsubscribe = settings.subscribe(() => changes++);
  settings.setThemeMode("dark");
  settings.setValue("oceans");
  assert.equal(map.basemap, "oceans");
  assert.equal(changes, 3);
  settings.destroy();
  settings.setThemeMode("light");
  assert.equal(settings.setValue("topo-vector"), false);
  detach();
  unsubscribe();
  assert.equal(map.basemap, "oceans");
});
