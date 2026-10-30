import assert from "node:assert/strict";
import test from "node:test";
import {
  createPreferencesSettings,
  PREFERENCES_KEY,
  MAP_POSITION_KEY,
} from "./createPreferencesSettings.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("Local preferences are opt-in for map positions and opt-out for theme and basemap", () => {
  const store = storage();
  const preferences = createPreferencesSettings({ storage: store });
  assert.deepEqual(preferences.getSnapshot(), {
    rememberBasemap: true,
    rememberMapPosition: false,
    rememberTheme: true,
  });
  preferences.saveMapPosition("main", { center: [12, 55], zoom: 7 });
  assert.equal(store.getItem(MAP_POSITION_KEY), null);
  preferences.set("rememberMapPosition", true);
  preferences.saveMapPosition("main", { center: [12, 55], zoom: 7 });
  preferences.saveMapPosition("assignment", { center: [10, 57], zoom: 5 });
  assert.deepEqual(preferences.readMapPosition("main"), { center: [12, 55], zoom: 7 });
  assert.deepEqual(preferences.readMapPosition("assignment"), { center: [10, 57], zoom: 5 });
  preferences.set("rememberMapPosition", false);
  assert.equal(store.getItem(MAP_POSITION_KEY), null);
  assert.equal(preferences.readMapPosition("main"), null);
  assert.ok(store.getItem(PREFERENCES_KEY));
  preferences.destroy();
});

test("Disabling theme memory clears the legacy and current entries", () => {
  const store = storage();
  store.setItem("data-catalogue:theme-mode", "dark");
  store.setItem("job-manager:theme-mode", "light");
  const preferences = createPreferencesSettings({ storage: store });
  preferences.set("rememberTheme", false);
  assert.equal(store.getItem("data-catalogue:theme-mode"), null);
  assert.equal(store.getItem("job-manager:theme-mode"), null);
  assert.equal(preferences.themeStorage.getItem("data-catalogue:theme-mode"), null);
  preferences.themeStorage.setItem("data-catalogue:theme-mode", "light");
  assert.equal(store.getItem("data-catalogue:theme-mode"), null);
  preferences.destroy();
});

test("Invalid or out-of-range map center and zoom never persist", () => {
  const store = storage();
  const preferences = createPreferencesSettings({ storage: store });
  preferences.set("rememberMapPosition", true);
  preferences.saveMapPosition("main", { center: [181, 20], zoom: 8 });
  preferences.saveMapPosition("main", { center: [20, 30], zoom: Number.NaN });
  preferences.saveMapPosition("other", { center: [20, 30], zoom: 8 });
  assert.equal(store.getItem(MAP_POSITION_KEY), null);
  preferences.destroy();
});
