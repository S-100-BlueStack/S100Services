import assert from "node:assert/strict";
import test from "node:test";

import { EXPORT_TARGET } from "../../data/domain/exportTarget.js";
import { isAnyPopupExportActionRunning } from "./popupExportState.js";
import { EXPORT_TYPE, SUPPORTED_EXPORT_ACTION_ID } from "./popupExportContract.js";
import { triggerExport } from "./popupProductActions.js";

const DATASET_NAME = "101DK0040943E";

test("direct triggerExport calls cannot bypass the export dispatch guard", async () => {
  let requestCalls = 0;
  let afterResultCalls = 0;

  const result = await triggerExport({
    datasetName: DATASET_NAME,
    actionId: SUPPORTED_EXPORT_ACTION_ID,
    target: EXPORT_TARGET.S57,
    exportType: EXPORT_TYPE.EDITION,
    implemented: true,
    request: async () => {
      requestCalls++;
      return { success: true };
    },
    afterResult: async () => {
      afterResultCalls++;
    },
  });

  assert.equal(result?.skipped, true);
  assert.equal(result?.reason, "unsupported-export-action");
  assert.equal(requestCalls, 0);
  assert.equal(afterResultCalls, 0);
  assert.equal(isAnyPopupExportActionRunning(DATASET_NAME), false);
});

test("guard rejection happens before confirmation and export state", async () => {
  const result = await triggerExport({
    datasetName: DATASET_NAME,
    actionId: SUPPORTED_EXPORT_ACTION_ID,
    target: EXPORT_TARGET.S100,
    exportType: EXPORT_TYPE.UPDATE,
    implemented: true,
    request: async () => ({ success: true }),
    confirm: {
      title: "This confirmation must not open",
      message: "Unsupported exports must be rejected first.",
    },
  });

  assert.equal(result?.skipped, true);
  assert.equal(isAnyPopupExportActionRunning(DATASET_NAME), false);
});
