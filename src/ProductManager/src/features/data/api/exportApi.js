import { EXPORT_TARGET } from "../domain/exportTarget.js";
import { PRODUCT_JOB_OPERATION } from "../../products/domain/productJob.js";
import { runProductJob } from "../../products/services/productJobService.js";
import { startProductJob } from "./productJobApi.js";

export async function exportNewEdition(datasetName) {
  if (!datasetName) {
    return createMissingDatasetNameResult();
  }

  return runProductJob({
    datasetName,
    operationType: PRODUCT_JOB_OPERATION.EXPORT_EDITION,
    exportTarget: EXPORT_TARGET.S100,
    label: "Exporting S100 Edition",
    startJob: () =>
      startProductJob(
        buildExportRequestPath(
          datasetName,
          "newedition",
          EXPORT_TARGET.S100,
        ),
      ),
  });
}

export async function exportRollback(datasetName) {
  if (!datasetName) {
    return createMissingDatasetNameResult();
  }

  return runProductJob({
    datasetName,
    operationType: PRODUCT_JOB_OPERATION.ROLLBACK,
    label: "Rolling back",
    startJob: () =>
      startProductJob(buildExportRequestPath(datasetName, "rollback")),
  });
}

export function buildExportRequestPath(
  datasetName,
  action,
  exportTarget = null,
) {
  const path = `export/${encodeURIComponent(datasetName)}/${action}/jobs`;

  if (!exportTarget) {
    return path;
  }

  const query = new URLSearchParams({ exportTarget });
  return `${path}?${query.toString()}`;
}

function createMissingDatasetNameResult() {
  return {
    success: false,
    errorMessage: "Cannot export product without a datasetName.",
  };
}
