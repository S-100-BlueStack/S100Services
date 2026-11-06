import ArcGISMap from "@arcgis/core/Map.js";
import MapView from "@arcgis/core/views/MapView.js";
import { createDefaultMapConfig, configureArcGisRuntime } from "../config/mapConfig.js";
import { createMapPositionPersistence } from "./createMapPositionPersistence.js";
export function createBaseMapView({
  container,
  runtimeConfig,
  mapConfig,
  layers = [],
  viewOptions = {},
  basemapSettings,
  positionSlot = "main",
}) {
  if (!container) throw new Error("MapView container is required.");
  configureArcGisRuntime(runtimeConfig);
  const config = mapConfig ?? createDefaultMapConfig();
  const map = new ArcGISMap({ basemap: basemapSettings?.getValue() ?? config.basemap, layers });
  const detachBasemap = basemapSettings?.registerMap(map) ?? (() => {});
  const view = new MapView({
    container,
    map,
    center: config.center,
    zoom: config.zoom,
    constraints: config.constraints,
    ...viewOptions,
  });
  const detachPosition = createMapPositionPersistence({
    view,
    slot: positionSlot,
    preferences: basemapSettings?.preferences,
  });
  return {
    map,
    view,
    detachBasemap() {
      detachPosition();
      detachBasemap();
    },
  };
}
