import darkArcgisThemeUrl from "@arcgis/core/assets/esri/themes/dark/main.css?url";
import lightArcgisThemeUrl from "@arcgis/core/assets/esri/themes/light/main.css?url";

import {
  THEME_MODE,
  getNextThemeMode,
  isThemeMode,
  normalizeThemeMode,
} from "../domain/themeMode.js";

const THEME_STORAGE_KEY = "job-manager:theme-mode";
const ARCGIS_THEME_LINK_ID = "arcgis-theme-css";

export function createThemeStore({
  documentElement = document.documentElement,
  documentHead = document.head,
  storage = window.localStorage,
  mediaQueryList = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null,
} = {}) {
  let state = {
    themeMode: resolveInitialThemeMode({ storage, mediaQueryList }),
  };
  const listeners = new Set();

  applyThemeMode({
    documentElement,
    documentHead,
    themeMode: state.themeMode,
  });

  const handleSystemThemeChange = () => {
    if (readStoredThemeMode(storage)) {
      return;
    }

    setThemeMode(resolveSystemThemeMode(mediaQueryList), {
      persist: false,
    });
  };

  addMediaQueryListener(mediaQueryList, handleSystemThemeChange);

  function subscribe(listener) {
    listeners.add(listener);
    listener(getSnapshot());

    return () => {
      listeners.delete(listener);
    };
  }

  function getSnapshot() {
    return {
      themeMode: state.themeMode,
    };
  }

  function setThemeMode(nextThemeMode, { persist = true } = {}) {
    const normalizedThemeMode = normalizeThemeMode(nextThemeMode);

    if (state.themeMode === normalizedThemeMode) {
      return getSnapshot();
    }

    state = {
      themeMode: normalizedThemeMode,
    };

    if (persist) {
      writeStoredThemeMode(storage, normalizedThemeMode);
    }

    applyThemeMode({
      documentElement,
      documentHead,
      themeMode: normalizedThemeMode,
    });
    emit();

    return getSnapshot();
  }

  function toggleThemeMode() {
    return setThemeMode(getNextThemeMode(state.themeMode));
  }

  function destroy() {
    removeMediaQueryListener(mediaQueryList, handleSystemThemeChange);
    listeners.clear();
  }

  function emit() {
    const snapshot = getSnapshot();

    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  return {
    subscribe,
    getSnapshot,
    setThemeMode,
    toggleThemeMode,
    destroy,
  };
}

function resolveInitialThemeMode({ storage, mediaQueryList }) {
  return readStoredThemeMode(storage) ?? resolveSystemThemeMode(mediaQueryList);
}

function resolveSystemThemeMode(mediaQueryList) {
  return mediaQueryList?.matches ? THEME_MODE.DARK : THEME_MODE.LIGHT;
}

function applyThemeMode({ documentElement, documentHead, themeMode }) {
  const normalizedThemeMode = normalizeThemeMode(themeMode);
  const isDark = normalizedThemeMode === THEME_MODE.DARK;

  documentElement.classList.toggle("calcite-mode-dark", isDark);
  documentElement.classList.toggle("calcite-mode-light", !isDark);
  documentElement.dataset.theme = normalizedThemeMode;
  documentElement.style.colorScheme = normalizedThemeMode;

  applyArcgisTheme({
    documentHead,
    themeMode: normalizedThemeMode,
  });
}

function applyArcgisTheme({ documentHead, themeMode }) {
  const linkElement = getArcgisThemeLink(documentHead);

  linkElement.href = themeMode === THEME_MODE.DARK ? darkArcgisThemeUrl : lightArcgisThemeUrl;
}

function getArcgisThemeLink(documentHead) {
  let linkElement = document.getElementById(ARCGIS_THEME_LINK_ID);

  if (linkElement) {
    return linkElement;
  }

  linkElement = document.createElement("link");
  linkElement.id = ARCGIS_THEME_LINK_ID;
  linkElement.rel = "stylesheet";

  documentHead.appendChild(linkElement);

  return linkElement;
}

function readStoredThemeMode(storage) {
  try {
    const storedValue = storage?.getItem?.(THEME_STORAGE_KEY);

    return isThemeMode(storedValue) ? storedValue : null;
  } catch {
    return null;
  }
}

function writeStoredThemeMode(storage, themeMode) {
  try {
    storage?.setItem?.(THEME_STORAGE_KEY, normalizeThemeMode(themeMode));
  } catch {
    // Theme preference persistence should never block the app shell.
  }
}

function addMediaQueryListener(mediaQueryList, listener) {
  if (!mediaQueryList) {
    return;
  }

  if (typeof mediaQueryList.addEventListener === "function") {
    mediaQueryList.addEventListener("change", listener);
    return;
  }

  mediaQueryList.addListener?.(listener);
}

function removeMediaQueryListener(mediaQueryList, listener) {
  if (!mediaQueryList) {
    return;
  }

  if (typeof mediaQueryList.removeEventListener === "function") {
    mediaQueryList.removeEventListener("change", listener);
    return;
  }

  mediaQueryList.removeListener?.(listener);
}
