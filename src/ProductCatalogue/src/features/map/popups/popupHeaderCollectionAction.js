import { layerSupportsCapability } from "../config/layerDefinitions.js";

const PRODUCT_COLLECTION_CAPABILITY = "supportsPopupActions";

export function resolvePopupHeaderCollectionAvailability(
  feature,
  { isReviewOrAnalyzeRoute = false } = {}
) {
  const datasetName = normalizeDatasetName(feature?.attributes?.datasetName);
  const supported = Boolean(
    datasetName &&
    !isReviewOrAnalyzeRoute &&
    layerSupportsCapability(feature, PRODUCT_COLLECTION_CAPABILITY)
  );

  return {
    supported,
    datasetName,
  };
}

export function reconcilePopupHeaderCollectionAction({
  feature,
  isReviewOrAnalyzeRoute = false,
  onSupported,
  onUnsupported,
} = {}) {
  const availability = resolvePopupHeaderCollectionAvailability(feature, {
    isReviewOrAnalyzeRoute,
  });

  if (!availability.supported) {
    onUnsupported?.(availability);
    return availability;
  }

  onSupported?.(availability);
  return availability;
}

export function mutatePopupHeaderCollection({
  feature,
  expectedDatasetName,
  isReviewOrAnalyzeRoute = false,
  hasProduct,
  addProduct,
  removeProduct,
} = {}) {
  const availability = resolvePopupHeaderCollectionAvailability(feature, {
    isReviewOrAnalyzeRoute,
  });
  const expectedName = normalizeDatasetName(expectedDatasetName);

  if (!availability.supported || availability.datasetName !== expectedName) {
    return {
      handled: false,
      reason: "unsupported",
      datasetName: availability.datasetName,
    };
  }

  if (hasProduct?.(availability.datasetName)) {
    removeProduct?.(availability.datasetName);
    return {
      handled: true,
      removed: true,
      datasetName: availability.datasetName,
    };
  }

  return {
    handled: true,
    removed: false,
    datasetName: availability.datasetName,
    addResult: addProduct?.({ datasetName: availability.datasetName }),
  };
}

function normalizeDatasetName(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
