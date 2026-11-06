export const DEFAULT_BASEMAP = "topo-vector";
export const DEFAULT_DARK_BASEMAP = "dark-gray-vector";
export const BASEMAP_STORAGE_KEY = "dataCatalogue.basemap.v1";
export const LEGACY_BASEMAP_SELECTION_KEY = "dataCatalogue.basemaps.v2";
export const BASEMAP_SELECTION_KEY = "dataCatalogue.basemapChoice.v3";

// The theme determines only the automatic default, not which basemaps users may choose.
export const BASEMAP_OPTIONS = Object.freeze([
  { id: DEFAULT_BASEMAP, label: "Topographic", mode: "light", requiresKey: false },
  { id: "oceans", label: "Oceans", mode: "light", requiresKey: false },
  { id: DEFAULT_DARK_BASEMAP, label: "Dark Gray", mode: "dark", requiresKey: false },
  {
    id: "arcgis/human-geography-dark",
    label: "Human Geography Dark",
    mode: "dark",
    requiresKey: true,
  },
]);

const DEFAULTS = Object.freeze({ light: DEFAULT_BASEMAP, dark: DEFAULT_DARK_BASEMAP });

function supportedBasemap(id, hasApiKey) {
  return (
    BASEMAP_OPTIONS.find((option) => option.id === id && (!option.requiresKey || hasApiKey))?.id ??
    null
  );
}

export function validBasemapId(id, { hasApiKey = false, mode = "light" } = {}) {
  return supportedBasemap(id, hasApiKey) ?? DEFAULTS[mode === "dark" ? "dark" : "light"];
}

function readStorage(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function readJSON(storage, key) {
  try {
    return JSON.parse(readStorage(storage, key) ?? "null");
  } catch {
    return null;
  }
}

export function createBasemapSettings({
  apiKey = "",
  storage,
  preferences,
  themeMode = "light",
} = {}) {
  const hasApiKey = Boolean(apiKey?.trim());
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = null;
    }
  }
  let mode = themeMode === "dark" ? "dark" : "light";
  const saved = readJSON(storage, BASEMAP_SELECTION_KEY);
  let manuallySelected = supportedBasemap(saved?.manualId, hasApiKey);

  // The v4 format did not distinguish an automatic default from a selection.
  // Preserve only a non-default legacy choice as explicit user intent.
  if (!manuallySelected && !saved) {
    const legacy = readJSON(storage, LEGACY_BASEMAP_SELECTION_KEY);
    const legacyValue = legacy?.[mode] ?? readStorage(storage, BASEMAP_STORAGE_KEY);
    if (legacyValue !== DEFAULTS[mode]) {
      manuallySelected = supportedBasemap(legacyValue, hasApiKey);
    }
  }

  const listeners = new Set();
  const maps = new Set();
  let alive = true;
  const remember = () => preferences?.getSnapshot().rememberBasemap ?? true;
  const currentBasemap = () => manuallySelected ?? DEFAULTS[mode];

  function persist() {
    if (!remember()) return;
    try {
      if (manuallySelected) {
        storage?.setItem(BASEMAP_SELECTION_KEY, JSON.stringify({ manualId: manuallySelected }));
      } else {
        storage?.removeItem(BASEMAP_SELECTION_KEY);
      }
      storage?.removeItem(LEGACY_BASEMAP_SELECTION_KEY);
      storage?.removeItem(BASEMAP_STORAGE_KEY);
    } catch {
      // The in-memory map choice remains usable without browser storage.
    }
  }

  function notify() {
    const value = currentBasemap();
    for (const map of maps) map.basemap = value;
    for (const listener of listeners) listener(value, mode, Boolean(manuallySelected));
  }

  const unsubscribePreferences =
    preferences?.subscribe((snapshot) => {
      if (snapshot.rememberBasemap) persist();
    }) ?? (() => {});
  if (!preferences) persist();

  return {
    preferences,
    hasApiKey,
    getValue: currentBasemap,
    getThemeMode: () => mode,
    getOptions: () => BASEMAP_OPTIONS.filter((entry) => !entry.requiresKey || hasApiKey),
    isCustom: () => Boolean(manuallySelected),
    setThemeMode(nextMode) {
      if (!alive) return;
      const normalized = nextMode === "dark" ? "dark" : "light";
      if (mode === normalized) return;
      mode = normalized;
      notify();
    },
    setValue(id) {
      if (!alive) return false;
      const next = supportedBasemap(id, hasApiKey);
      if (!next) return false;
      if (manuallySelected === next) return true;
      manuallySelected = next;
      persist();
      notify();
      return true;
    },
    resetToThemeDefault() {
      if (!alive || !manuallySelected) return;
      manuallySelected = null;
      persist();
      notify();
    },
    registerMap(map) {
      if (!alive) return () => {};
      map.basemap = currentBasemap();
      maps.add(map);
      return () => maps.delete(map);
    },
    subscribe(listener) {
      if (!alive) return () => {};
      listeners.add(listener);
      listener(currentBasemap(), mode, Boolean(manuallySelected));
      return () => listeners.delete(listener);
    },
    destroy() {
      alive = false;
      unsubscribePreferences();
      listeners.clear();
      maps.clear();
    },
  };
}
