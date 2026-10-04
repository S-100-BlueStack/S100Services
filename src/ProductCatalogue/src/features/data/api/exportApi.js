import { PRODUCT_JOB_OPERATION } from "../../products/domain/productJob.js";
import { runProductJob } from "../../products/services/productJobService.js";
import { startProductJob } from "./productJobApi.js";

export function exportNewEdition(datasetName) {
  return runExport(datasetName, "newedition", PRODUCT_JOB_OPERATION.EXPORT_EDITION);
}

export function exportNewUpdate(datasetName) {
  return runExport(datasetName, "newupdate", PRODUCT_JOB_OPERATION.EXPORT_UPDATE);
}

export function exportRollback(datasetName) {
  return runExport(datasetName, "cancel-export", PRODUCT_JOB_OPERATION.ROLLBACK);
}

function runExport(datasetName, action, operationType) {
  return runProductJob({
    datasetName,
    operationType,
    // The backend resolves the product specification from the exact catalogue dataset.
    startJob: () => startProductJob(buildExportRequestPath(datasetName, action)),
  });
}

export function buildExportRequestPath(datasetName, action) {
  if (!["newedition", "newupdate", "cancel-export"].includes(action)) {
    throw new Error("Unsupported export operation.");
  }
  return `export/${encodeURIComponent(datasetName)}/${action}`;
}
