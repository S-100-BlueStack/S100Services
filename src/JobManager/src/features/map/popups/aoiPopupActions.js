import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";

import { AOI_FIELD } from "../../aoi/config/aoiFieldConfig.js";

export const AOI_POPUP_ACTION = Object.freeze({
  SHOW_RELATED_JOBS: "show-related-jobs",
});

export function createAoiPopupActions() {
  return [
    {
      id: AOI_POPUP_ACTION.SHOW_RELATED_JOBS,
      title: "Show related Jobs",
      icon: "list",
    },
  ];
}

export function registerAoiPopupActions({ view, onShowRelatedJobs } = {}) {
  if (!view || typeof onShowRelatedJobs !== "function") {
    return () => {};
  }

  const abortController = new AbortController();
  let popupActionHandle = null;

  const registerPopupViewModelHandler = (popupViewModel) => {
    if (!popupViewModel?.on || popupActionHandle || abortController.signal.aborted) {
      return;
    }

    popupActionHandle = popupViewModel.on("trigger-action", (event) => {
      if (event.action?.id !== AOI_POPUP_ACTION.SHOW_RELATED_JOBS) {
        return;
      }

      const selectedFeature = getSelectedPopupFeature(popupViewModel);
      const selectedAoi = createAoiSelectionFromGraphic(selectedFeature);

      onShowRelatedJobs(selectedAoi);
    });
  };

  const popupViewModel = view.popup?.viewModel;

  if (popupViewModel?.on) {
    registerPopupViewModelHandler(popupViewModel);
  } else {
    // Popup internals can be created lazily, so wait for the ViewModel before wiring actions.
    void reactiveUtils
      .whenOnce(() => view.popup?.viewModel, {
        signal: abortController.signal,
      })
      .then(registerPopupViewModelHandler)
      .catch((error) => {
        if (error?.name !== "AbortError") {
          throw error;
        }
      });
  }

  return () => {
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
