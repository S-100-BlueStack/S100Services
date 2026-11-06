export const DEFAULT_BASEMAP = "topo-vector";
export const DEFAULT_DARK_BASEMAP = "dark-gray-vector";
export const BASEMAP_SELECTION_STORAGE_KEY = "pc.basemapChoice.v1";

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

function normalizeMode(mode) {
  return mode === "dark" ? "dark" : "light";
}

function supportedBasemap(id, hasApiKey) {
  return (
    BASEMAP_OPTIONS.find((option) => option.id === id && (!option.requiresKey || hasApiKey))?.id ??
    null
  );
}

function getBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readManualId(storage, hasApiKey) {
  try {
    const saved = JSON.parse(storage?.getItem(BASEMAP_SELECTION_STORAGE_KEY) ?? "null");
    return supportedBasemap(saved?.manualId, hasApiKey);
  } catch {
    return null;
  }
}

export function createBasemapSettings({
  apiKey = "",
  storage = getBrowserStorage(),
  themeMode = "light",
  canPersist = () => true,
  onPersistenceChanged = () => ({ remove() {} }),
} = {}) {
  const hasApiKey = Boolean(typeof apiKey === "string" && apiKey.trim());
  let mode = normalizeMode(themeMode);
  let manuallySelected = canPersist() ? readManualId(storage, hasApiKey) : null;
  let alive = true;
  const maps = new Set();
  const listeners = new Set();
  const currentBasemap = () =>
    manuallySelected ?? (mode === "dark" ? DEFAULT_DARK_BASEMAP : DEFAULT_BASEMAP);

  function persist() {
    if (!canPersist()) return;
    try {
      if (manuallySelected) {
        storage?.setItem(
          BASEMAP_SELECTION_STORAGE_KEY,
          JSON.stringify({ manualId: manuallySelected })
        );
      } else {
        storage?.removeItem(BASEMAP_SELECTION_STORAGE_KEY);
      }
    } catch {
      // Browser storage must not prevent a usable session-only basemap choice.
    }
  }

  function applyToMap(map) {
    const id = currentBasemap();
    // Avoid reloading basemap layers when an unrelated preference changes.
    if (map.basemap !== id && map.basemap?.id !== id) {
      map.basemap = id;
    }
  }

  function notify() {
    for (const map of maps) applyToMap(map);
    for (const listener of listeners) listener(currentBasemap(), mode, Boolean(manuallySelected));
  }

  const persistenceHandle = onPersistenceChanged((enabled) => {
    if (!alive) return;
    if (enabled) {
      persist();
    } else {
      try {
        storage?.removeItem(BASEMAP_SELECTION_STORAGE_KEY);
      } catch {
        // The current selection remains usable if storage is blocked.
      }
    }
  });

  return {
    hasApiKey,
    getValue: currentBasemap,
    getThemeMode: () => mode,
    isCustom: () => Boolean(manuallySelected),
    getOptions: () => BASEMAP_OPTIONS.filter((option) => !option.requiresKey || hasApiKey),
    setThemeMode(nextMode) {
      if (!alive) return;
      const normalized = normalizeMode(nextMode);
      if (normalized === mode) return;
      mode = normalized;
      notify();
    },
    setValue(id) {
      if (!alive) return false;
      const normalized = supportedBasemap(id, hasApiKey);
      if (!normalized) return false;
      if (normalized === manuallySelected) return true;
      manuallySelected = normalized;
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
      if (!alive || !map) return () => {};
      maps.add(map);
      applyToMap(map);
      return () => maps.delete(map);
    },
    subscribe(listener) {
      if (!alive) return () => {};
      listeners.add(listener);
      listener(currentBasemap(), mode, Boolean(manuallySelected));
      return () => listeners.delete(listener);
    },
    destroy() {
      if (!alive) return;
      alive = false;
      persistenceHandle?.remove?.();
      maps.clear();
      listeners.clear();
    },
  };
}
