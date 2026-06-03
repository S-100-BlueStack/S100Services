import { apiRequest } from "../../../shared/api/apiClient.js";

export async function exportNewEdition(datasetName) {
  return postExportRequest(datasetName, "newedition");
}

export async function exportNewUpdate(datasetName) {
  return postExportRequest(datasetName, "newupdate");
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
    headers: {
      "Content-Type": "application/json",
    },
  });
}
