const BASEMAP_BY_THEME = {
  light: "arcgis/topographic",
  dark: "arcgis/dark-gray",
};

export function applyBasemapTheme(view, themeName) {
  if (!view?.map) {
    return;
  }

  const basemap = BASEMAP_BY_THEME[themeName] ?? BASEMAP_BY_THEME.light;

  // Assigning the same basemap repeatedly can trigger unnecessary layer reloads.
  if (view.map.basemap?.id === basemap) {
    return;
  }

  view.map.basemap = basemap;
}
