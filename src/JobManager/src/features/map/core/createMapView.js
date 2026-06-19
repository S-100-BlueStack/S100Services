import ArcGISMap from "@arcgis/core/Map.js";
import MapView from "@arcgis/core/views/MapView.js";

import { createDefaultMapConfig, configureArcGisRuntime } from "../config/mapConfig.js";
import { createAoiLayer } from "../layers/createAoiLayer.js";
import { createJobLayers } from "../layers/createJobLayers.js";

export function createMapView({ container, runtimeConfig, mapConfig } = {}) {
  if (!container) {
    throw new Error("MapView container is required.");
  }

  configureArcGisRuntime(runtimeConfig);

  const resolvedMapConfig = mapConfig ?? createDefaultMapConfig();
  const aoiLayer = createAoiLayer({ runtimeConfig });
  const jobLayers = createJobLayers();
  const operationalLayers = [...(aoiLayer ? [aoiLayer] : []), ...jobLayers.layers];
  const map = new ArcGISMap({
    basemap: resolvedMapConfig.basemap,
    layers: operationalLayers,
  });

  const view = new MapView({
    container,
    map,
    center: resolvedMapConfig.center,
    zoom: resolvedMapConfig.zoom,
    constraints: resolvedMapConfig.constraints,
  });

  return {
    map,
    view,
    layers: {
      aoiLayer,
      jobLayers,
    },
  };
}
