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
  assert.equal(settings.getOptions().length, 3, "Keyed styles remain hidden before access verification");
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

test("an expired API key cannot block map startup through a persisted protected basemap", async () => {
  const storage = memoryStorage({
    [BASEMAP_SELECTION_KEY]: JSON.stringify({ manualId: "arcgis/human-geography-dark" }),
  });
  let rejectValidation;
  let validations = 0;
  const notices = [];
  const settings = createBasemapSettings({
    apiKey: "expired-key",
    storage,
    themeMode: "dark",
    validateProtectedBasemap: () => {
      validations++;
      return new Promise((resolve, reject) => { rejectValidation = reject; });
    },
    onUnavailable: (notice) => notices.push(notice),
  });
  const first = {};
  const second = {};
  try {
    assert.equal(settings.getValue(), DEFAULT_DARK_BASEMAP);
    settings.registerMap(first);
    settings.registerMap(second);
    assert.equal(first.basemap, DEFAULT_DARK_BASEMAP);
    assert.equal(second.basemap, DEFAULT_DARK_BASEMAP);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(validations, 1, "Two map views must share a single credential check");
    rejectValidation(new Error("Token Invalid"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(first.basemap, DEFAULT_DARK_BASEMAP);
    assert.equal(settings.getOptions().length, 3);
    assert.equal(storage.getItem(BASEMAP_SELECTION_KEY), null);
    assert.equal(settings.isCustom(), false);
    assert.equal(notices.length, 1);
    assert.doesNotMatch(notices[0].message, /expired-key/);
  } finally {
    settings.destroy();
  }
});

test("a verified API key activates the saved protected basemap only after validation", async () => {
  const storage = memoryStorage({
    [BASEMAP_SELECTION_KEY]: JSON.stringify({ manualId: "arcgis/human-geography-dark" }),
  });
  let resolveValidation;
  const settings = createBasemapSettings({
    apiKey: "browser-key",
    storage,
    validateProtectedBasemap: () => new Promise((resolve) => { resolveValidation = resolve; }),
  });
  const map = {};
  try {
    settings.registerMap(map);
    assert.equal(map.basemap, DEFAULT_BASEMAP);
    assert.equal(settings.getOptions().length, 3);
    await new Promise((resolve) => setImmediate(resolve));
    resolveValidation(true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(map.basemap, "arcgis/human-geography-dark");
    assert.equal(settings.getOptions().length, 4);
    assert.equal(settings.isCustom(), true);
  } finally {
    settings.destroy();
  }
});

test("late credential validation after destroy cannot write map state or notices", async () => {
  let rejectValidation;
  const notices = [];
  const settings = createBasemapSettings({
    apiKey: "browser-key",
    validateProtectedBasemap: () => new Promise((resolve, reject) => { rejectValidation = reject; }),
    onUnavailable: (notice) => notices.push(notice),
    storage: null,
  });
  const map = {};
  settings.registerMap(map);
  await new Promise((resolve) => setImmediate(resolve));
  settings.destroy();
  rejectValidation(new Error("Token Invalid"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(map.basemap, DEFAULT_BASEMAP);
  assert.equal(notices.length, 0);
});
