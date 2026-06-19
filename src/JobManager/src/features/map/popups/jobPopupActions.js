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

      const selectedJob = createJobSelectionFromPopupViewModel(popupViewModel);

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

export function createJobSelectionFromPopupViewModel(popupViewModel) {
  return createJobSelectionFromGraphic(getSelectedJobPopupFeature(popupViewModel));
}

export function createJobSelectionFromGraphic(graphic) {
  const attributes = graphic?.attributes ?? {};

  return {
    jobId: normalizeOptionalString(attributes[JOB_LAYER_FIELD.JOB_ID]),
    jobTitle: normalizeOptionalString(attributes[JOB_LAYER_FIELD.TITLE]) || "Selected Job",
    objectId: attributes[JOB_LAYER_FIELD.OBJECT_ID],
    geometryType: normalizeOptionalString(
      attributes[JOB_LAYER_FIELD.GEOMETRY_TYPE] ?? graphic?.geometry?.type
    ),
  };
}

function getSelectedJobPopupFeature(popupViewModel) {
  const features = getPopupFeatures(popupViewModel);
  const selectedIndex = Number.isInteger(popupViewModel?.selectedFeatureIndex)
    ? popupViewModel.selectedFeatureIndex
    : 0;

  const candidates = dedupeFeatures([
    popupViewModel?.activeFeature,
    features[selectedIndex],
    popupViewModel?.selectedFeature,
    ...features,
  ]);

  return (
    candidates.find(hasJobAttributes) ?? candidates.find((candidate) => Boolean(candidate)) ?? null
  );
}

function getPopupFeatures(popupViewModel) {
  const features = popupViewModel?.features;

  if (Array.isArray(features)) {
    return features;
  }

  if (typeof features?.toArray === "function") {
    return features.toArray();
  }

  if (typeof features?.at === "function") {
    const length = Number(features.length ?? 0);
    const resolvedFeatures = [];

    for (let index = 0; index < length; index += 1) {
      const feature = features.at(index);

      if (feature) {
        resolvedFeatures.push(feature);
      }
    }

    return resolvedFeatures;
  }

  return [];
}

function dedupeFeatures(features) {
  return features.filter((feature, index) => {
    if (!feature) {
      return false;
    }

    return features.indexOf(feature) === index;
  });
}

function hasJobAttributes(feature) {
  return Boolean(normalizeOptionalString(feature?.attributes?.[JOB_LAYER_FIELD.JOB_ID]));
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
