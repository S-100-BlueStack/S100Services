import { apiRequest } from "../../../shared/api/apiClient.js";

export async function exportNewEdition(datasetName) {
  return postExportRequest(datasetName, "newedition");
}

export async function exportNewUpdate(datasetName) {
  return postExportRequest(datasetName, "newupdate");
}

// Backwards-compatible aliases if you already imported these names somewhere.
export const newEdition = exportNewEdition;
export const newUpdate = exportNewUpdate;

function postExportRequest(datasetName, action) {
  if (!datasetName) {
    return {
      success: false,
      errorMessage: "Cannot export product without a datasetName.",
    };
  }

  return apiRequest(`export/${encodeURIComponent(datasetName)}/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
}
