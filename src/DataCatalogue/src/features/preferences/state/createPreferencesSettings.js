import { THEME_STORAGE_KEY, LEGACY_THEME_STORAGE_KEY } from "../../theme/state/themeStorage.js";

export const PREFERENCES_KEY = "dataCatalogue.preferences.v1";
export const MAP_POSITION_KEY = "dataCatalogue.mapPositions.v1";
export const DEFAULT_PREFERENCES = Object.freeze({
  rememberBasemap: true,
  rememberMapPosition: false,
  rememberTheme: true,
});

function getBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readJSON(storage, key) {
  try {
    return JSON.parse(storage?.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function storeJSON(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Preferences must not block map operation when browser storage is unavailable.
  }
}

function remove(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // Local storage is optional.
  }
}

function validPosition(value) {
  return (
    value &&
    Array.isArray(value.center) &&
    value.center.length === 2 &&
    value.center.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    value.center[0] >= -180 &&
    value.center[0] <= 180 &&
    value.center[1] >= -90 &&
    value.center[1] <= 90 &&
    typeof value.zoom === "number" &&
    Number.isFinite(value.zoom) &&
    value.zoom >= 0 &&
    value.zoom <= 23
  );
}

export function createPreferencesSettings({ storage = getBrowserStorage() } = {}) {
  const stored = readJSON(storage, PREFERENCES_KEY);
  let state = Object.fromEntries(
    Object.entries(DEFAULT_PREFERENCES).map(([key, defaultValue]) => [
      key,
      typeof stored?.[key] === "boolean" ? stored[key] : defaultValue,
    ])
  );
  const listeners = new Set();
  let positions = readJSON(storage, MAP_POSITION_KEY) ?? {};
  let alive = true;

  function update(key, enabled) {
    if (!alive || !(key in DEFAULT_PREFERENCES)) return;
    const value = Boolean(enabled);
    if (state[key] === value) return;
    state = { ...state, [key]: value };
    storeJSON(storage, PREFERENCES_KEY, state);
    if (!value) {
      if (key === "rememberBasemap") {
        remove(storage, "dataCatalogue.basemap.v1");
        remove(storage, "dataCatalogue.basemaps.v2");
        remove(storage, "dataCatalogue.basemapChoice.v3");
      }
      if (key === "rememberMapPosition") {
        positions = {};
        remove(storage, MAP_POSITION_KEY);
      }
      if (key === "rememberTheme") {
        remove(storage, THEME_STORAGE_KEY);
        remove(storage, LEGACY_THEME_STORAGE_KEY);
      }
    }
    for (const listener of listeners) listener({ ...state });
  }

  return {
    storage,
    getSnapshot: () => ({ ...state }),
    set: update,
    subscribe(listener) {
      if (!alive) return () => {};
      listeners.add(listener);
      listener({ ...state });
      return () => listeners.delete(listener);
    },
    themeStorage: {
      getItem(key) {
        return state.rememberTheme ? storage?.getItem(key) : null;
      },
      setItem(key, value) {
        if (state.rememberTheme) storage?.setItem(key, value);
      },
    },
    readMapPosition(slot) {
      const position = state.rememberMapPosition ? positions?.[slot] : null;
      return validPosition(position) ? { center: [...position.center], zoom: position.zoom } : null;
    },
    saveMapPosition(slot, position) {
      if (!alive || !state.rememberMapPosition || !["main", "assignment"].includes(slot)) return;
      if (!validPosition(position)) return;
      positions = { ...positions, [slot]: { center: [...position.center], zoom: position.zoom } };
      storeJSON(storage, MAP_POSITION_KEY, positions);
    },
    destroy() {
      alive = false;
      listeners.clear();
    },
  };
}
