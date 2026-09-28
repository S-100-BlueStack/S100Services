export const THEME_MODE = Object.freeze({
  LIGHT: "light",
  DARK: "dark",
});

const THEME_MODE_VALUES = new Set(Object.values(THEME_MODE));

export function normalizeThemeMode(value) {
  const normalizedValue = normalizeOptionalString(value);

  return THEME_MODE_VALUES.has(normalizedValue) ? normalizedValue : THEME_MODE.LIGHT;
}

export function getNextThemeMode(themeMode) {
  return normalizeThemeMode(themeMode) === THEME_MODE.DARK ? THEME_MODE.LIGHT : THEME_MODE.DARK;
}

export function isThemeMode(value) {
  return THEME_MODE_VALUES.has(normalizeOptionalString(value));
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
