import lightThemeUrl from "@arcgis/core/assets/esri/themes/light/main.css?url";
import darkThemeUrl from "@arcgis/core/assets/esri/themes/dark/main.css?url";
import {
  PREFERENCE_PERSISTENCE_KEY,
  isPreferencePersistenceEnabled,
  onPreferencePersistenceChanged,
} from "../preferences/state/preferencePersistenceState.js";

const THEME_STORAGE_KEY = "app-theme";

export const themes = {
  light: "light",
  dark: "dark",
};

onPreferencePersistenceChanged(({ key, enabled }) => {
  if (key !== PREFERENCE_PERSISTENCE_KEY.THEME) {
    return;
  }

  if (!enabled) {
    removeStoredTheme();
    return;
  }

  writeStoredTheme(getCurrentTheme());
});

function getModeClass(theme) {
  return theme === themes.dark ? "calcite-mode-dark" : "calcite-mode-light";
}

function getArcgisThemeLink() {
  let link = document.getElementById("arcgis-theme-css");

  if (!link) {
    link = document.createElement("link");
    link.id = "arcgis-theme-css";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }

  return link;
}

function applyCalciteMode(theme) {
  const root = document.documentElement;
  const modeClass = getModeClass(theme);

  root.classList.remove("calcite-mode-light", "calcite-mode-dark");
  root.classList.add(modeClass);
}

function applyArcgisTheme(theme) {
  const link = getArcgisThemeLink();
  link.href = theme === themes.dark ? darkThemeUrl : lightThemeUrl;
}

function applyAttributionTheme(view, theme) {
  if (!view) return;

  const mode = theme === themes.dark ? "dark" : "light";

  if (view.ready) {
    view.attributionMode = mode;
    return;
  }

  view.when(() => {
    view.attributionMode = mode;
  });
}

export function resetThemePreference(view = null) {
  removeStoredTheme();
  applyTheme(themes.light, view);
}

export function applyTheme(theme, view = null) {
  const normalizedTheme = normalizeTheme(theme);

  applyCalciteMode(normalizedTheme);
  applyArcgisTheme(normalizedTheme);
  applyAttributionTheme(view, normalizedTheme);
  writeStoredTheme(normalizedTheme);
}

export function getStoredTheme() {
  if (!isPreferencePersistenceEnabled(PREFERENCE_PERSISTENCE_KEY.THEME)) {
    return themes.light;
  }

  try {
    return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch (error) {
    console.warn("Failed to read theme preference.", error);
    return themes.light;
  }
}

export function getCurrentTheme() {
  return document.documentElement.classList.contains("calcite-mode-dark")
    ? themes.dark
    : themes.light;
}

export function initializeTheme(view = null) {
  applyTheme(getStoredTheme(), view);
}

export function toggleTheme(view = null) {
  const nextTheme = getCurrentTheme() === themes.dark ? themes.light : themes.dark;
  applyTheme(nextTheme, view);
  return nextTheme;
}

function normalizeTheme(theme) {
  return theme === themes.dark ? themes.dark : themes.light;
}

function writeStoredTheme(theme) {
  if (!isPreferencePersistenceEnabled(PREFERENCE_PERSISTENCE_KEY.THEME)) {
    return;
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, normalizeTheme(theme));
  } catch (error) {
    console.warn("Failed to save theme preference.", error);
  }
}

function removeStoredTheme() {
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to remove theme preference.", error);
  }
}
