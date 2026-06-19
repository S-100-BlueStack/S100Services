import { AOI_FIELD } from "../../aoi/config/aoiFieldConfig.js";

export const AOI_POPUP_ACTION = Object.freeze({
  SHOW_RELATED_JOBS: "show-related-jobs",
});

export function createAoiPopupActions() {
  return [
    {
      id: AOI_POPUP_ACTION.SHOW_RELATED_JOBS,
      title: "Show related Jobs",
    },
  ];
}

export function registerAoiPopupActions({ view, onShowRelatedJobs } = {}) {
  if (!view?.popup?.on || typeof onShowRelatedJobs !== "function") {
    return () => {};
  }

  const handle = view.popup.on("trigger-action", (event) => {
    if (event.action?.id !== AOI_POPUP_ACTION.SHOW_RELATED_JOBS) {
      return;
    }

    const selectedAoi = createAoiSelectionFromGraphic(getSelectedPopupFeature(view));

    onShowRelatedJobs(selectedAoi);
  });

  return () => {
    handle.remove();
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

function getSelectedPopupFeature(view) {
  if (view.popup?.selectedFeature) {
    return view.popup.selectedFeature;
  }

  const features = view.popup?.features;

  if (Array.isArray(features)) {
    return features[0] ?? null;
  }

  if (typeof features?.at === "function") {
    return features.at(0) ?? null;
  }

  return features?.[0] ?? null;
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
