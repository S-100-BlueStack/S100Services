import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";

import { createBaseMapView } from "./createBaseMapView.js";
import { createAoiLayer } from "../layers/createAoiLayer.js";
import { createJobLayers } from "../layers/createJobLayers.js";

export function createMapView({ container, runtimeConfig, mapConfig, basemapSettings } = {}) {
  if (!container) {
    throw new Error("MapView container is required.");
  }

  const aoiLayer = runtimeConfig?.sourceMode === "live" ? null : createAoiLayer({ runtimeConfig });
  const jobLayers = createJobLayers();
  const operationalLayers = [...(aoiLayer ? [aoiLayer] : []), ...jobLayers.layers];
  const { map, view, detachBasemap } = createBaseMapView({
    container,
    runtimeConfig,
    mapConfig,
    basemapSettings,
    layers: operationalLayers,
    viewOptions: {
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
    },
  });

  // Keep zoom controls at the same top-right position as the assignment map.
  view.ui.move("zoom", "top-right");

  configurePopupDefaults(view);

  return {
    map,
    view,
    detachBasemap,
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
