import MapView from "@arcgis/core/views/MapView.js";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import { highlightConfig } from "../../../shared/config/colorsConfig.js";
import { applyHeaderColor } from "../popups/popupHeaderController.js";

export function createView(map) {
  const view = new MapView({
    container: "viewDiv",
    map: map,
    center: [10.3, 56],
    zoom: 6,
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
    highlights: highlightConfig,
  });

  reactiveUtils.when(
    () => view.popup?.viewModel,
    () => {
      view.popup.viewModel.includeDefaultActions = false;
      view.popup.actions = [];
    },
    { once: true }
  );

  reactiveUtils.when(
    () => view.popup.container,
    (container) => {
      const observer = new MutationObserver(() => applyHeaderColor(view));

      observer.observe(container, {
        childList: true,
        subtree: true,
      });

      reactiveUtils.watch(
        () => view.popup.selectedFeature,
        () => applyHeaderColor(view)
      );
    },
    { once: true }
  );

  return view;
}
