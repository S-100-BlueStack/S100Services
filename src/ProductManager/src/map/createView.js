import MapView from "@arcgis/core/views/MapView.js";
import { highlightConfig } from "../config/colorsConfig";
import {
  registerPopupActions,
  registerPopupHeaderActions,
} from "../utils/popupActions";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import { applyHeaderColor } from "../ui/popupHeaderController";

export function createView(map) {
  const view = new MapView({
    container: "viewDiv",
    map: map,
    center: [12.56, 55.67],
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
      actions: [
        {
          title: "Freeze",
          id: "freeze-feature",
          icon: "snow",
        },
        {
          title: "Send immediately",
          id: "send-immediately",
          icon: "send",
        },
      ],
    },

    highlights: highlightConfig,
  });

  reactiveUtils.when(
    () => view.popup?.viewModel,
    () => {
      view.popup.viewModel.includeDefaultActions = false;
    },
    { once: true },
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
        () => applyHeaderColor(view),
      );
    },
  );
  registerPopupActions(view);
  //registerPopupHeaderActions(view);
  return view;
}
