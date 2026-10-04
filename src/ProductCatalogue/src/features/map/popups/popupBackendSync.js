import {
  PRODUCT_OPERATION_CAPABILITY,
  createProductContextIdentityAttributes,
  productContextSupportsCapability,
} from "../../products/domain/productContext.js";

export function canUseCompatibilityProductBackend(productContext) {
  return productContextSupportsCapability(
    productContext,
    PRODUCT_OPERATION_CAPABILITY.BACKEND_PRODUCT_REFRESH
  );
}

export function initializePopupBackendSynchronization({
  productContext,
  datasetName,
  refresh,
  watchActiveProductJobs,
  registerPopupRefreshHandler,
} = {}) {
  if (
    !datasetName ||
    typeof refresh !== "function" ||
    !canUseCompatibilityProductBackend(productContext)
  ) {
    return {
      enabled: false,
      stopWatchingActiveJobs: null,
      stopRefreshingPopup: null,
    };
  }

  return {
    enabled: true,
    stopWatchingActiveJobs:
      typeof watchActiveProductJobs === "function" ? watchActiveProductJobs(datasetName) : null,
    stopRefreshingPopup:
      typeof registerPopupRefreshHandler === "function"
        ? registerPopupRefreshHandler({ datasetName, refresh })
        : null,
  };
}

export async function fetchPopupProductRefresh({ productContext, datasetName, fetchProduct } = {}) {
  if (
    !datasetName ||
    typeof fetchProduct !== "function" ||
    !canUseCompatibilityProductBackend(productContext)
  ) {
    return { dispatched: false, result: null };
  }

  return {
    dispatched: true,
    result: await fetchProduct(datasetName),
  };
}

export function mergePopupProductRefreshAttributes(productContext, refreshAttributes) {
  const identityAttributes = createProductContextIdentityAttributes(productContext);
  if (!identityAttributes) {
    return { ...(refreshAttributes ?? {}) };
  }

  return {
    ...(refreshAttributes ?? {}),
    ...identityAttributes,
  };
}
