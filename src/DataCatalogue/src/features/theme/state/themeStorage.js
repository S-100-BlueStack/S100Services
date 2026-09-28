import { isThemeMode, normalizeThemeMode } from "../domain/themeMode.js";

const THEME_STORAGE_KEY = "data-catalogue:theme-mode";
// Preserve preferences saved before the app rename without maintaining two write targets.
const LEGACY_THEME_STORAGE_KEY = "job-manager:theme-mode";

export function resolveThemeStorage(host = globalThis) {
  try {
    return host.window?.localStorage ?? null;
  } catch {
    // Accessing the storage property itself can fail in restricted browser contexts.
    return null;
  }
}

export function readStoredThemeMode(storage) {
  try {
    const storedValue = storage?.getItem?.(THEME_STORAGE_KEY);

    if (isThemeMode(storedValue)) {
      return normalizeThemeMode(storedValue);
    }

    const legacyValue = storage?.getItem?.(LEGACY_THEME_STORAGE_KEY);

    if (!isThemeMode(legacyValue)) {
      return null;
    }

    const themeMode = normalizeThemeMode(legacyValue);
    writeStoredThemeMode(storage, themeMode);

    // Keep the old value intact so testing the renamed app does not break rollback.
    return themeMode;
  } catch {
    return null;
  }
}

export function writeStoredThemeMode(storage, themeMode) {
  try {
    storage?.setItem?.(THEME_STORAGE_KEY, normalizeThemeMode(themeMode));
  } catch {
    // Persistence must not prevent applying an in-memory theme or completing startup.
  }
}
