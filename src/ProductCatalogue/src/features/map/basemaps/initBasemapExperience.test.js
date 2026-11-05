import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createBasemapSettings } from "./basemapSettings.js";

async function loadInitializer(dependencies) {
  const url = new URL("./initBasemapExperience.js", import.meta.url);
  const source = (await readFile(url, "utf8")).replace(
    /import\s+([\s\S]*?)\s+from\s+"[^"]+";/g,
    (_, names) => `const ${names} = globalThis.__basemapExperienceDependencies;`
  );
  globalThis.__basemapExperienceDependencies = dependencies;
  try {
    const { initBasemapExperience } = await import(
      `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    );
    return initBasemapExperience;
  } finally {
    delete globalThis.__basemapExperienceDependencies;
  }
}

test("MapView basemap controls follow Theme and clean up their own UI and observers", async () => {
  const priorDocument = globalThis.document;
  const themeListeners = new Set();
  const state = {
    selection: null,
    mounted: null,
    destroyed: 0,
    removed: null,
    selectorModes: [],
    zoomModes: [],
    zoomDestroyed: 0,
  };
  globalThis.document = { createElement: () => ({ className: "" }) };
  const dependencies = {
    createBasemapSettings,
    getCurrentTheme: () => "light",
    onThemeChanged(callback) {
      themeListeners.add(callback);
      return { remove: () => themeListeners.delete(callback) };
    },
    PREFERENCE_PERSISTENCE_KEY: { BASEMAP: "basemap" },
    isPreferencePersistenceEnabled: () => false,
    onPreferencePersistenceChanged: () => ({ remove() {} }),
    readArcGISBasemapApiKey: () => "browser-key",
    createBasemapSelector({ settings }) {
      state.selection = settings;
      return {
        setView(view) {
          state.mounted = view;
        },
        close: () => false,
        setThemeMode(theme) {
          state.selectorModes.push(theme);
        },
        destroy() {
          state.destroyed++;
        },
      };
    },
    initZoomControl(view, { themeMode }) {
      assert.equal(view, state.mounted);
      state.zoomModes.push(themeMode);
      return {
        setThemeMode(theme) {
          state.zoomModes.push(theme);
        },
        destroy() {
          state.zoomDestroyed++;
        },
      };
    },
  };
  try {
    const initBasemapExperience = await loadInitializer(dependencies);
    const map = {};
    const view = {
      map,
      ui: {
        add(options) {
          assert.equal(options.length, 1);
          assert.deepEqual(
            { position: options[0].position, index: options[0].index },
            { position: "top-left", index: 1 }
          );
          this.host = options[0].component;
        },
        remove(element) {
          state.removed = element;
        },
      },
    };
    const experience = initBasemapExperience(view);
    assert.equal(state.mounted, view);
    assert.equal(map.basemap, "topo-vector");
    assert.equal(themeListeners.size, 1);
    for (const callback of themeListeners) callback("dark");
    assert.equal(map.basemap, "dark-gray-vector");
    assert.deepEqual(state.selectorModes, ["dark"]);
    assert.deepEqual(state.zoomModes, ["light", "dark"]);
    state.selection.setValue("oceans");
    for (const callback of themeListeners) callback("light");
    assert.equal(map.basemap, "oceans", "manual choice is never overwritten by Theme");
    experience.destroy();
    experience.destroy();
    assert.equal(themeListeners.size, 0);
    assert.equal(state.removed, view.ui.host);
    assert.equal(state.destroyed, 1);
    assert.equal(state.zoomDestroyed, 1);
    assert.deepEqual(state.zoomModes, ["light", "dark", "light"]);
    assert.equal(state.selection.setValue("dark-gray-vector"), false);
  } finally {
    globalThis.document = priorDocument;
  }
});

test("Views without an active MapView UI do not create basemap ownership", async () => {
  const initBasemapExperience = await loadInitializer({});
  const inactive = initBasemapExperience({ map: {} });
  assert.equal(inactive.settings, null);
  inactive.destroy();
});
