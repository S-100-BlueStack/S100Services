import { apiRequest } from "../../../shared/api/apiClient.js";
import { getApiResultErrorMessage } from "../../../shared/api/apiResult.js";
import { PRODUCT_JOB_OPERATION } from "../../products/domain/productJob.js";
import { runProductJob } from "../../products/services/productJobService.js";
import { normalizeElectronicProductResponse } from "../normalizers/productResponse.js";

const PRODUCT_MUTATION_TIMEOUT_MS = 30 * 1000;
const SELECTED_PRODUCT_REFRESH_TIMEOUT_MS = 15 * 1000;

export async function uploadProduct(datasetName, { onAccepted } = {}) {
  return runProductJob({
    datasetName,
    operationType: PRODUCT_JOB_OPERATION.SEND_TO_ICENC,
    label: "Simulating IC-ENC send",
    onAccepted,
    startJob: () =>
      apiRequest(`upload/${encodeURIComponent(datasetName)}`, {
        method: "PUT",
      }),
  });
}

export async function changeFreezeState(datasetName, state) {
  const action = state === true ? "freeze" : "unfreeze";

  return apiRequest(`upload/${encodeURIComponent(datasetName)}/${action}`, {
    method: "PUT",
    timeoutMs: PRODUCT_MUTATION_TIMEOUT_MS,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function fetchProductPropertiesByDatasetName(datasetName) {
  if (!datasetName) {
    return {
      success: false,
      errorMessage: "Cannot refresh selected product without a datasetName.",
    };
  }

  const result = await apiRequest(`electronicproducts/${encodeURIComponent(datasetName)}`, {
    method: "GET",
    timeoutMs: SELECTED_PRODUCT_REFRESH_TIMEOUT_MS,
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  if (!result.success) {
    return {
      ...result,
      errorMessage: getApiResultErrorMessage(result, "Selected product refresh failed"),
    };
  }
  return {
    ...result,
    data: normalizeElectronicProductResponse(result.data),
  };
}
