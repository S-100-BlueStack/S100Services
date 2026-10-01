import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";

import { createBaseMapView } from "./createBaseMapView.js";
import { createAoiLayer } from "../layers/createAoiLayer.js";
import { createJobLayers } from "../layers/createJobLayers.js";

export function createMapView({ container, runtimeConfig, mapConfig } = {}) {
  if (!container) {
    throw new Error("MapView container is required.");
  }

  const aoiLayer = createAoiLayer({ runtimeConfig });
  const jobLayers = createJobLayers();
  const operationalLayers = [...(aoiLayer ? [aoiLayer] : []), ...jobLayers.layers];
  const { map, view } = createBaseMapView({
    container,
    runtimeConfig,
    mapConfig,
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
