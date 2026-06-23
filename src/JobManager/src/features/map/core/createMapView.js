import ArcGISMap from "@arcgis/core/Map.js";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
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
    popup: {
      dockEnabled: false,
      dockOptions: {
        buttonEnabled: false,
      },
      visibleElements: {
        collapseButton: false,
        featureNavigation: false,
      },
      actions: [],
    },
  });

  configurePopupDefaults(view);

  return {
    map,
    view,
    layers: {
      aoiLayer,
      jobLayers,
    },
  };
}

function configurePopupDefaults(view) {
  reactiveUtils.when(
    () => view.popup?.viewModel,
    () => {
      view.popup.viewModel.includeDefaultActions = false;
      view.popup.actions = [];
    },
    { once: true }
  );
}
