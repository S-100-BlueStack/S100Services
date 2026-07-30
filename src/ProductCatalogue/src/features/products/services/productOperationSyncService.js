import { fetchProductOperationState } from "../api/productOperationApi.js";
import {
  clearExternalProductOperations,
  replaceExternalProductOperations,
} from "../state/productOperationState.js";

export async function syncProductOperationState(datasetName) {
  if (!datasetName) {
    return {
      synced: false,
      endpointAvailable: false,
      reason: "datasetName is required.",
    };
  }

  const response = await fetchProductOperationState(datasetName);

  if (!response.endpointAvailable) {
    clearExternalProductOperations(datasetName);

    return {
      synced: false,
      endpointAvailable: false,
      reason: "Product operation endpoint is not available.",
    };
  }

  replaceExternalProductOperations(datasetName, response.operations);

  return {
    synced: true,
    endpointAvailable: true,
  };
}
