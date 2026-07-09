import { apiRequest } from "../../../shared/api/apiClient.js";

const EXPORT_REQUEST_TIMEOUT_MS = 0;

export async function exportNewEdition(datasetName) {
  return postExportRequest(datasetName, "newedition");
}

export async function exportNewUpdate(datasetName) {
  return postExportRequest(datasetName, "newupdate");
}

export async function exportRollback(datasetName) {
  return postExportRequest(datasetName, "rollback");
}

function postExportRequest(datasetName, action) {
  if (!datasetName) {
    return {
      success: false,
      errorMessage: "Cannot export product without a datasetName.",
    };
  }

  return apiRequest(`export/${encodeURIComponent(datasetName)}/${action}`, {
    method: "POST",
    // Exports and rollback are currently synchronous backend operations and can
    // take longer than normal UI mutations. Keep frontend timeout disabled until
    // the backend exposes async jobs or operation status.
    timeoutMs: EXPORT_REQUEST_TIMEOUT_MS,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
