import { normalizeThemeMode } from "../domain/themeMode.js";

// Calcite 5.2 uses the standard CSS color-scheme property instead of mode classes.
// Keep the app-owned data attribute for theme-specific CSS outside Calcite.
export function applyDocumentTheme({ documentElement, themeMode }) {
  const normalizedThemeMode = normalizeThemeMode(themeMode);
  documentElement.dataset.theme = normalizedThemeMode;
  documentElement.style.colorScheme = normalizedThemeMode;
}
