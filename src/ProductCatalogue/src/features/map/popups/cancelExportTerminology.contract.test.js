import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../../..", import.meta.url);

async function readSource(path) {
  return readFile(new URL(path, projectRoot), "utf8");
}

test("Cancel Export presentation preserves legacy rollback contracts", async () => {
  const [
    actionConfig,
    productActions,
    actionAvailability,
    exportApi,
    productJob,
    operationState,
    tooltips,
  ] = await Promise.all([
    readSource("src/features/map/popups/popupActionConfig.js"),
    readSource("src/features/map/popups/popupProductActions.js"),
    readSource("src/features/products/domain/productActionAvailability.js"),
    readSource("src/features/data/api/exportApi.js"),
    readSource("src/features/products/domain/productJob.js"),
    readSource("src/features/products/state/productOperationState.js"),
    readSource("src/shared/ui/tooltips/globalHelpTooltips.js"),
  ]);

  assert.match(
    actionConfig,
    /id: "rollback",[\s\S]*label: operationIsRunning \? "Canceling export\.\.\." : "Cancel Export",[\s\S]*icon: "x-circle"/
  );
  assert.match(productActions, /title: `Cancel Export \${datasetName}`/);
  assert.match(
    productActions,
    /`Are you sure you want to cancel the current export for \${datasetName}\? `/
  );
  assert.match(productActions, /confirmText: "Confirm"/);
  assert.match(productActions, /type: PRODUCT_OPERATION_TYPE\.ROLLBACK/);
  assert.match(productActions, /execute: \(\) => exportRollback\(datasetName\)/);
  assert.match(productActions, /Cancel Export completed for \${datasetName} with a warning/);
  assert.match(productActions, /Cancel Export completed for \${datasetName}/);
  assert.match(productActions, /Network error while canceling export for \${datasetName}/);
  assert.match(productActions, /Failed to cancel export for \${datasetName}/);
  assert.match(productActions, /Unexpected error while canceling export for \${datasetName}/);
  assert.match(
    actionAvailability,
    /Cancel Export is only available when product status is Exported or Frozen\./
  );

  assert.match(exportApi, /export async function exportRollback\(datasetName\)/);
  assert.match(exportApi, /operationType: PRODUCT_JOB_OPERATION\.ROLLBACK/);
  assert.match(exportApi, /buildExportRequestPath\(datasetName, "rollback"\)/);
  assert.match(productJob, /ROLLBACK: "Rollback"/);
  assert.match(operationState, /ROLLBACK: "rollback"/);
  assert.match(operationState, /\[PRODUCT_OPERATION_TYPE\.ROLLBACK\]: "Cancel Export"/);
  assert.match(tooltips, /rollback: "Cancel the current export for this product\."/);
});
