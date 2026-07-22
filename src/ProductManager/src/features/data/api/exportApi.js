import { apiRequest } from "../../../shared/api/apiClient.js";
import { EXPORT_TARGET } from "../domain/exportTarget.js";

const EXPORT_REQUEST_TIMEOUT_MS = 0;

export async function exportNewEdition(datasetName) {
  return postExportRequest(datasetName, "newedition", EXPORT_TARGET.S100);
}

export async function exportRollback(datasetName) {
  return postExportRequest(datasetName, "rollback");
}

export function buildExportRequestPath(datasetName, action, exportTarget = null) {
  const path = `export/${encodeURIComponent(datasetName)}/${action}`;

  if (!exportTarget) {
    return path;
  }

  const query = new URLSearchParams({
    exportTarget,
  });

  return `${path}?${query.toString()}`;
}

function postExportRequest(datasetName, action, exportTarget = null) {
  if (!datasetName) {
    return {
      success: false,
      errorMessage: "Cannot export product without a datasetName.",
    };
  }

  return apiRequest(buildExportRequestPath(datasetName, action, exportTarget), {
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
