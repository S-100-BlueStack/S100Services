import MapView from "@arcgis/core/views/MapView.js";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import { highlightConfig } from "../../../shared/config/colorsConfig.js";
import { registerPopupActions } from "../popups/popupActions.js";
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
      actions: [
        {
          title: "Freeze",
          id: "freeze-feature",
          icon: "snow",
          className: "freeze-feature",
        },
        {
          title: "Send immediately",
          id: "send-immediately",
          icon: "send",
          className: "send-immediately",
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
      reactiveUtils.watch(
        () => view.popup.selectedFeature,
        (feature) => {
          if (!feature) {
            window.hoverManager?.clearLockedFeature();
            return;
          }

          window.hoverManager?.setLockedFeature(feature);
        }
      );
    }
  );
  registerPopupActions(view);
  return view;
}
