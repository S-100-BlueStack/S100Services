import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";

import { JOB_LAYER_FIELD } from "../layers/jobLayerFeatureData.js";

export const JOB_POPUP_ACTION = Object.freeze({
  SHOW_JOB_DETAILS: "show-job-details",
});

export function createJobPopupActions() {
  return [
    {
      id: JOB_POPUP_ACTION.SHOW_JOB_DETAILS,
      title: "Show Job details",
      icon: "information",
    },
  ];
}

export function registerJobPopupActions({ view, onShowJobDetails } = {}) {
  if (!view || typeof onShowJobDetails !== "function") {
    return () => {};
  }

  const abortController = new AbortController();
  let popupActionHandle = null;

  const registerPopupViewModelHandler = (popupViewModel) => {
    if (!popupViewModel?.on || popupActionHandle || abortController.signal.aborted) {
      return;
    }

    popupActionHandle = popupViewModel.on("trigger-action", (event) => {
      if (event.action?.id !== JOB_POPUP_ACTION.SHOW_JOB_DETAILS) {
        return;
      }

      const selectedFeature = getSelectedPopupFeature(popupViewModel);
      const selectedJob = createJobSelectionFromGraphic(selectedFeature);

      onShowJobDetails(selectedJob);
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

export function createJobSelectionFromGraphic(graphic) {
  const attributes = graphic?.attributes ?? {};

  return {
    jobId: normalizeOptionalString(attributes[JOB_LAYER_FIELD.JOB_ID]),
    jobTitle: normalizeOptionalString(attributes[JOB_LAYER_FIELD.TITLE]) || "Selected Job",
    objectId: attributes[JOB_LAYER_FIELD.OBJECT_ID],
    geometryType: normalizeOptionalString(attributes[JOB_LAYER_FIELD.GEOMETRY_TYPE]),
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

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
