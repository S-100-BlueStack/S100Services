import lightThemeUrl from "@arcgis/core/assets/esri/themes/light/main.css?url";
import darkThemeUrl from "@arcgis/core/assets/esri/themes/dark/main.css?url";

const THEME_STORAGE_KEY = "app-theme";

export const themes = {
  light: "light",
  dark: "dark",
};

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
  applyTheme(themes.light, view);
}

export function applyTheme(theme, view = null) {
  applyCalciteMode(theme);
  applyArcgisTheme(theme);
  applyAttributionTheme(view, theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function getStoredTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY) || themes.light;
}

export function initializeTheme(view = null) {
  applyTheme(getStoredTheme(), view);
}

export function toggleTheme(view = null) {
  const nextTheme = getStoredTheme() === themes.dark ? themes.light : themes.dark;
  applyTheme(nextTheme, view);
  return nextTheme;
}
