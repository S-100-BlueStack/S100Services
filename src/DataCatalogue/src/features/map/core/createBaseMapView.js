import ArcGISMap from "@arcgis/core/Map.js";
import MapView from "@arcgis/core/views/MapView.js";
import { createDefaultMapConfig, configureArcGisRuntime } from "../config/mapConfig.js";
export function createBaseMapView({
  container,
  runtimeConfig,
  mapConfig,
  layers = [],
  viewOptions = {},
}) {
  if (!container) throw new Error("MapView container is required.");
  configureArcGisRuntime(runtimeConfig);
  const config = mapConfig ?? createDefaultMapConfig();
  const map = new ArcGISMap({ basemap: config.basemap, layers });
  const view = new MapView({
    container,
    map,
    center: config.center,
    zoom: config.zoom,
    constraints: config.constraints,
    ...viewOptions,
  });
  return { map, view };
}
