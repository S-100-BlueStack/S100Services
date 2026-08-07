import {
  PRODUCT_OPERATION_CAPABILITY,
  productContextSupportsCapability,
  resolveProductContext,
} from "../../products/domain/productContext.js";

export function resolvePopupHeaderCollectionAvailability(
  feature,
  { isReviewOrAnalyzeRoute = false } = {}
) {
  const datasetName = normalizeDatasetName(feature?.attributes?.datasetName);
  const productContext = resolveProductContext({ graphic: feature });
  const supported = Boolean(
    datasetName &&
    !isReviewOrAnalyzeRoute &&
    productContextSupportsCapability(
      productContext,
      PRODUCT_OPERATION_CAPABILITY.PRODUCT_COLLECTION
    )
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
  // Re-resolve the currently selected Graphic at click time. This prevents a
  // stale header button from mutating Product Collection after selection changes.
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
