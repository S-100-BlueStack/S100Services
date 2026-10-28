import {
  PRODUCT_OPERATION_CAPABILITY,
  getProductContextIdentityKey,
  productContextSupportsCapability,
  resolveProductContext,
} from "../../products/domain/productContext.js";

export function resolvePopupHeaderCollectionAvailability(
  feature,
  { isReviewOrAnalyzeRoute = false } = {}
) {
  const datasetName = normalizeDatasetName(feature?.attributes?.datasetName);
  const productContext = resolveProductContext({ graphic: feature });
  const identityKey = getProductContextIdentityKey(productContext);
  const supported = Boolean(
    datasetName &&
    identityKey &&
    !isReviewOrAnalyzeRoute &&
    productContextSupportsCapability(
      productContext,
      PRODUCT_OPERATION_CAPABILITY.PRODUCT_COLLECTION
    )
  );

  return {
    supported,
    datasetName,
    identityKey,
    productContext,
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
  expectedIdentityKey,
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
  const expectedIdentity = normalizeText(expectedIdentityKey);
  const identityChanged = expectedIdentity && availability.identityKey !== expectedIdentity;

  if (!availability.supported || availability.datasetName !== expectedName || identityChanged) {
    return {
      handled: false,
      reason: "unsupported",
      datasetName: availability.datasetName,
    };
  }

  if (hasProduct?.(availability.productContext)) {
    removeProduct?.(availability.productContext);
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
    addResult: addProduct?.(availability.productContext),
  };
}

function normalizeDatasetName(value) {
  return normalizeText(value);
}

function normalizeText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
