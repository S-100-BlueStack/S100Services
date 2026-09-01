import { fetchProductHistory } from "../../timeline/api/productHistoryApi.js";
import {
  WORKSPACE_PRODUCT_RESOLUTION_STATUS,
  getDefaultWorkspaceProductService,
} from "../../products/services/workspaceProductService.js";

export const REVIEW_PRODUCT_LOAD_STATE = Object.freeze({
  LOADED: "loaded",
  UNAVAILABLE: "unavailable",
  FAILED: "failed",
});

export async function loadReviewHistories(
  datasetNames,
  {
    workspaceProductService = getDefaultWorkspaceProductService(),
    fetchHistory = fetchProductHistory,
  } = {}
) {
  const names = normalizeDatasetNames(datasetNames);
  const results = await Promise.allSettled(
    names.map(async (datasetName) => {
      const resolution = await workspaceProductService.resolveProduct(datasetName);
      if (resolution.status !== WORKSPACE_PRODUCT_RESOLUTION_STATUS.RESOLVED) {
        throw new Error(
          resolution.error ?? `Product ${datasetName} could not be resolved for Product Review.`
        );
      }

      const productContext = resolution.product;
      const history = await fetchHistory(datasetName, { productContext, workspaceProductService });

      return {
        datasetName,
        sourceId: productContext.sourceId,
        sourceLabel: productContext.sourceLabel,
        productType: productContext.productType,
        productContext,
        loadState: history.endpointAvailable
          ? REVIEW_PRODUCT_LOAD_STATE.LOADED
          : REVIEW_PRODUCT_LOAD_STATE.UNAVAILABLE,
        history,
        error: null,
      };
    })
  );
  return results.map((result, index) => {
    const datasetName = names[index];

    if (result.status === "fulfilled") {
      return result.value;
    }

    return {
      datasetName,
      sourceId: null,
      sourceLabel: null,
      productType: null,
      productContext: null,
      loadState: REVIEW_PRODUCT_LOAD_STATE.FAILED,
      history: null,
      error: result.reason instanceof Error ? result.reason.message : "Unknown history error.",
    };
  });
}

function normalizeDatasetNames(datasetNames) {
  const values = Array.isArray(datasetNames) ? datasetNames : [datasetNames];
  return values.map((value) => String(value ?? "").trim()).filter(Boolean);
}
