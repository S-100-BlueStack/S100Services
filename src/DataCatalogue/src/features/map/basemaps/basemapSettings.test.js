import assert from "node:assert/strict";
import test from "node:test";
import {
  BASEMAP_OPTIONS,
  BASEMAP_SELECTION_KEY,
  DEFAULT_BASEMAP,
  DEFAULT_DARK_BASEMAP,
  LEGACY_BASEMAP_SELECTION_KEY,
  createBasemapSettings,
  validBasemapId,
} from "./basemapSettings.js";
import { createPreferencesSettings } from "../../preferences/state/createPreferencesSettings.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

test("All supported light and dark basemaps are available in either theme", () => {
  assert.equal(BASEMAP_OPTIONS.filter((entry) => entry.mode === "light").length, 2);
  assert.equal(BASEMAP_OPTIONS.filter((entry) => entry.mode === "dark").length, 2);
  assert.equal(validBasemapId("dark-gray-vector", { mode: "light" }), DEFAULT_DARK_BASEMAP);
  assert.equal(validBasemapId("oceans", { mode: "dark" }), "oceans");
  assert.equal(
    validBasemapId("arcgis/human-geography-dark", { mode: "dark" }),
    DEFAULT_DARK_BASEMAP
  );
  assert.equal(validBasemapId("javascript:alert(1)"), DEFAULT_BASEMAP);
  const settings = createBasemapSettings({ apiKey: "browser-key" });
  assert.equal(settings.getOptions().length, 4);
  settings.destroy();
});

test("Theme changes choose the opposite default only before manual selection", () => {
  const storage = memoryStorage();
  const preferences = createPreferencesSettings({ storage });
  const settings = createBasemapSettings({ storage, preferences, apiKey: "browser-key" });
  const first = {};
  const second = {};
  const detachFirst = settings.registerMap(first);
  settings.registerMap(second);
  assert.equal(first.basemap, DEFAULT_BASEMAP);
  settings.setThemeMode("dark");
  assert.equal(first.basemap, DEFAULT_DARK_BASEMAP);
  assert.equal(second.basemap, DEFAULT_DARK_BASEMAP);
  assert.equal(settings.isCustom(), false);
  assert.equal(settings.setValue("oceans"), true);
  assert.equal(first.basemap, "oceans");
  assert.equal(second.basemap, "oceans");
  assert.equal(settings.isCustom(), true);
  settings.setThemeMode("light");
  settings.setThemeMode("dark");
  assert.equal(first.basemap, "oceans", "A light basemap can be kept under a dark theme");
  assert.deepEqual(JSON.parse(storage.getItem(BASEMAP_SELECTION_KEY)), { manualId: "oceans" });

  const restored = createBasemapSettings({ storage, preferences, themeMode: "dark" });
  assert.equal(restored.getValue(), "oceans");
  restored.destroy();
  settings.resetToThemeDefault();
  assert.equal(settings.getValue(), DEFAULT_DARK_BASEMAP);
  assert.equal(storage.getItem(BASEMAP_SELECTION_KEY), null);
  detachFirst();
  settings.setValue("topo-vector");
  assert.equal(first.basemap, DEFAULT_DARK_BASEMAP);
  settings.destroy();
  preferences.destroy();
});

test("Automatic defaults are not mistaken for explicit v4 preferences", () => {
  const storage = memoryStorage({
    [LEGACY_BASEMAP_SELECTION_KEY]: JSON.stringify({
      light: DEFAULT_BASEMAP,
      dark: DEFAULT_DARK_BASEMAP,
    }),
  });
  const settings = createBasemapSettings({ storage });
  assert.equal(settings.isCustom(), false);
  settings.setThemeMode("dark");
  assert.equal(settings.getValue(), DEFAULT_DARK_BASEMAP);
  settings.destroy();
});

test("A nondefault v4 choice can migrate to a manual choice", () => {
  const storage = memoryStorage({
    [LEGACY_BASEMAP_SELECTION_KEY]: JSON.stringify({ light: "oceans", dark: DEFAULT_DARK_BASEMAP }),
  });
  const settings = createBasemapSettings({ storage });
  assert.equal(settings.getValue(), "oceans");
  assert.equal(settings.isCustom(), true);
  assert.equal(storage.getItem(LEGACY_BASEMAP_SELECTION_KEY), null);
  settings.destroy();
});

test("Disabling storage does not alter the current manual choice", () => {
  const storage = memoryStorage();
  const preferences = createPreferencesSettings({ storage });
  const settings = createBasemapSettings({ storage, preferences });
  settings.setValue("oceans");
  preferences.set("rememberBasemap", false);
  assert.equal(storage.getItem(BASEMAP_SELECTION_KEY), null);
  assert.equal(settings.getValue(), "oceans");
  settings.setThemeMode("dark");
  assert.equal(settings.getValue(), "oceans");
  preferences.set("rememberBasemap", true);
  assert.equal(storage.getItem(BASEMAP_SELECTION_KEY) !== null, true);
  settings.destroy();
  preferences.destroy();
});

test("Storage failures do not prevent basemap changes", () => {
  const settings = createBasemapSettings({
    storage: {
      getItem() {
        throw new Error("Storage denied");
      },
      setItem() {
        throw new Error("Storage denied");
      },
      removeItem() {
        throw new Error("Storage denied");
      },
    },
  });
  settings.setThemeMode("dark");
  assert.equal(settings.getValue(), DEFAULT_DARK_BASEMAP);
  settings.setValue(DEFAULT_BASEMAP);
  assert.equal(settings.getValue(), DEFAULT_BASEMAP);
  settings.destroy();
});
