import MapView from "@arcgis/core/views/MapView.js";
import { highlightConfig } from "../config/colorsConfig";
import { registerPopupActions } from "../utils/popupActions";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";

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
  registerPopupActions(view);

  return view;
}
