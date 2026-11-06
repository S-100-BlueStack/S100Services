import { createPackagePopupBackendSynchronization } from "./packagePopupFreshness.js";
import { createWorkspaceFreshnessMonitor } from "../../products/services/workspaceFreshnessMonitor.js";
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
  syncFromGraphic,
  createFreshnessMonitor = createWorkspaceFreshnessMonitor,
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

  if (productContext?.workUnit?.kind === "package") {
    return createPackagePopupBackendSynchronization({
      datasetName,
      refresh,
      createFreshnessMonitor,
      registerPopupRefreshHandler,
      syncFromGraphic,
    });
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

  const result = await fetchProduct(datasetName);
  if (result?.success && productContext?.workUnit?.kind === "package") {
    const members = result.data?.workUnitMetadata?.members;
    const primary = members?.[productContext.workUnit.primaryMemberKey]?.datasetName;
    const normalize = (value) =>
      String(value ?? "")
        .trim()
        .toUpperCase();
    if (
      (result.data?.datasetName && normalize(result.data.datasetName) !== normalize(datasetName)) ||
      (primary && normalize(primary) !== normalize(datasetName)) ||
      Object.entries(members ?? {}).some(
        ([key, member]) =>
          key !== productContext.workUnit.primaryMemberKey &&
          normalize(member.datasetName) === normalize(datasetName)
      )
    ) {
      return {
        dispatched: true,
        result: { success: false, errorMessage: "Contradictory package member identity." },
      };
    }
  }
  return { dispatched: true, result };
}

export function mergePopupProductRefreshAttributes(productContext, refreshAttributes) {
  if (productContext?.workUnit?.kind === "package") {
    return {
      workUnitMetadata: refreshAttributes?.workUnitMetadata,
      exportMetadata: refreshAttributes?.exportMetadata,
    };
  }
  const identityAttributes = createProductContextIdentityAttributes(productContext);
  if (!identityAttributes) {
    return { ...(refreshAttributes ?? {}) };
  }

  return {
    ...(refreshAttributes ?? {}),
    ...identityAttributes,
  };
}
