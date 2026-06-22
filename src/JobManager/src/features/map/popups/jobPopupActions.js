import CustomContent from "@arcgis/core/popup/content/CustomContent.js";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";

import { JOB_LAYER_FIELD } from "../layers/jobLayerFeatureData.js";

export const JOB_POPUP_ACTION = Object.freeze({
  SHOW_JOB_DETAILS: "show-job-details",
});

let latestFeatureScopedJobSelection = null;

export function createJobPopupActions() {
  return [
    {
      id: JOB_POPUP_ACTION.SHOW_JOB_DETAILS,
      title: "Show Job details",
      icon: "information",
    },
  ];
}

export function createJobPopupContextContent() {
  return new CustomContent({
    outFields: ["*"],
    creator(event) {
      latestFeatureScopedJobSelection = createJobSelectionFromGraphic(event?.graphic);

      const contextElement = document.createElement("span");
      contextElement.hidden = true;
      contextElement.setAttribute("aria-hidden", "true");

      return contextElement;
    },
  });
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

      const selectedJob = getSelectedJobForAction(popupViewModel);

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
    latestFeatureScopedJobSelection = null;
  };
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
    relatedAoiIds: parseRelatedAoiIds(attributes[JOB_LAYER_FIELD.RELATED_AOI_IDS]),
  };
}

function getSelectedJobForAction(popupViewModel) {
  if (latestFeatureScopedJobSelection?.jobId) {
    return latestFeatureScopedJobSelection;
  }

  return createJobSelectionFromGraphic(getSelectedJobPopupFeature(popupViewModel));
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

function parseRelatedAoiIds(value) {
  const normalizedValue = normalizeOptionalString(value);

  if (!normalizedValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(normalizedValue);

    if (Array.isArray(parsedValue)) {
      return normalizeRelatedAoiIds(parsedValue);
    }
  } catch {
    // JSON is the current format, but tolerate delimiter strings from earlier local data.
  }

  return normalizeRelatedAoiIds(normalizedValue.split("|"));
}

function normalizeRelatedAoiIds(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map(normalizeOptionalString).filter(Boolean))];
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
