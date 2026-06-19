import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";

import { AOI_FIELD } from "../../aoi/config/aoiFieldConfig.js";

export const AOI_POPUP_ACTION = Object.freeze({
  SHOW_RELATED_JOBS: "show-related-jobs",
});

const DEBUG_STORAGE_KEY = "jobManager.debug.aoiPopup";

export function createAoiPopupActions() {
  const actions = [
    {
      id: AOI_POPUP_ACTION.SHOW_RELATED_JOBS,
      title: "Show related Jobs",
      icon: "list",
    },
  ];

  debugPopup("createAoiPopupActions", {
    actions,
  });

  return actions;
}

export function registerAoiPopupActions({ view, onShowRelatedJobs } = {}) {
  debugPopup("registerAoiPopupActions called", {
    hasView: Boolean(view),
    hasPopup: Boolean(view?.popup),
    hasPopupOn: Boolean(view?.popup?.on),
    hasPopupViewModel: Boolean(view?.popup?.viewModel),
    hasPopupViewModelOn: Boolean(view?.popup?.viewModel?.on),
    hasCallback: typeof onShowRelatedJobs === "function",
  });

  if (!view || typeof onShowRelatedJobs !== "function") {
    debugPopup("registerAoiPopupActions skipped", {
      reason: "missing-view-or-callback",
    });

    return () => {};
  }

  const abortController = new AbortController();
  let popupActionHandle = null;

  const registerPopupViewModelHandler = (popupViewModel) => {
    debugPopup("registerPopupViewModelHandler called", {
      hasPopupViewModel: Boolean(popupViewModel),
      hasPopupViewModelOn: Boolean(popupViewModel?.on),
      alreadyRegistered: Boolean(popupActionHandle),
      aborted: abortController.signal.aborted,
      popupViewModelActions: getActionsForDebug(popupViewModel?.actions),
      popupViewModelAllActions: getActionsForDebug(popupViewModel?.allActions),
    });

    if (!popupViewModel?.on || popupActionHandle || abortController.signal.aborted) {
      return;
    }

    popupActionHandle = popupViewModel.on("trigger-action", (event) => {
      debugPopup("popup viewModel trigger-action fired", {
        action: event.action,
        expectedActionId: AOI_POPUP_ACTION.SHOW_RELATED_JOBS,
        selectedFeature: popupViewModel.selectedFeature,
        activeFeature: popupViewModel.activeFeature,
        selectedFeatureIndex: popupViewModel.selectedFeatureIndex,
      });

      if (event.action?.id !== AOI_POPUP_ACTION.SHOW_RELATED_JOBS) {
        debugPopup("popup viewModel trigger-action ignored", {
          actionId: event.action?.id,
        });

        return;
      }

      const selectedFeature = getSelectedPopupFeature(popupViewModel);
      const selectedAoi = createAoiSelectionFromGraphic(selectedFeature);

      debugPopup("selected AOI extracted", {
        selectedFeature,
        attributes: selectedFeature?.attributes,
        selectedAoi,
      });

      onShowRelatedJobs(selectedAoi);
    });

    debugPopup("popup viewModel trigger-action handler registered");
  };

  const popupViewModel = view.popup?.viewModel;

  if (popupViewModel?.on) {
    debugPopup("popup viewModel available immediately");
    registerPopupViewModelHandler(popupViewModel);
  } else {
    debugPopup("waiting for view.popup.viewModel with reactiveUtils.whenOnce");

    void reactiveUtils
      .whenOnce(() => view.popup?.viewModel, {
        signal: abortController.signal,
      })
      .then((resolvedPopupViewModel) => {
        debugPopup("reactiveUtils.whenOnce resolved", {
          hasPopupViewModel: Boolean(resolvedPopupViewModel),
          hasPopupViewModelOn: Boolean(resolvedPopupViewModel?.on),
        });

        registerPopupViewModelHandler(resolvedPopupViewModel);
      })
      .catch((error) => {
        debugPopup("reactiveUtils.whenOnce failed", {
          name: error?.name,
          message: error?.message,
        });
      });
  }

  return () => {
    debugPopup("registerAoiPopupActions cleanup");
    abortController.abort();
    popupActionHandle?.remove();
    popupActionHandle = null;
  };
}

export function createAoiSelectionFromGraphic(graphic) {
  const attributes = graphic?.attributes ?? {};
  const globalId = normalizeOptionalString(attributes[AOI_FIELD.GLOBAL_ID]);
  const productId = normalizeOptionalString(attributes[AOI_FIELD.PRODUCT_ID]);
  const objectId = normalizeOptionalString(attributes[AOI_FIELD.OBJECT_ID]);
  const aoiId = globalId || productId || createObjectIdFallback(objectId);

  return {
    aoiId,
    aoiName: normalizeOptionalString(attributes[AOI_FIELD.DISPLAY_NAME]) || "Selected AOI",
    objectId,
  };
}

function getSelectedPopupFeature(popupViewModel) {
  if (popupViewModel?.selectedFeature) {
    return popupViewModel.selectedFeature;
  }

  if (popupViewModel?.activeFeature) {
    return popupViewModel.activeFeature;
  }

  const features = popupViewModel?.features;
  const selectedIndex = Number.isInteger(popupViewModel?.selectedFeatureIndex)
    ? popupViewModel.selectedFeatureIndex
    : 0;

  if (Array.isArray(features)) {
    return features[selectedIndex] ?? features[0] ?? null;
  }

  if (typeof features?.at === "function") {
    return features.at(selectedIndex) ?? features.at(0) ?? null;
  }

  return features?.[selectedIndex] ?? features?.[0] ?? null;
}

function getActionsForDebug(actions) {
  if (!actions) {
    return null;
  }

  if (Array.isArray(actions)) {
    return actions.map(toDebugAction);
  }

  if (typeof actions.toArray === "function") {
    return actions.toArray().map(toDebugAction);
  }

  return actions;
}

function toDebugAction(action) {
  return {
    id: action?.id,
    title: action?.title,
    type: action?.type,
  };
}

function createObjectIdFallback(objectId) {
  if (!objectId) {
    return "";
  }

  return `aoi-${objectId}`;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function debugPopup(message, payload) {
  if (!isPopupDebugEnabled()) {
    return;
  }

  if (payload === undefined) {
    console.debug(`[Job Manager AOI popup] ${message}`);
    return;
  }

  console.debug(`[Job Manager AOI popup] ${message}`, payload);
}

function isPopupDebugEnabled() {
  return globalThis.localStorage?.getItem(DEBUG_STORAGE_KEY) === "1";
}
