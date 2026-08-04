import assert from "node:assert/strict";
import test from "node:test";

import { EXPORT_TARGET } from "../../data/domain/exportTarget.js";
import { applyProductCatalogueCapabilities } from "../../data/stores/capabilityStore.js";
import { getNotices } from "../../notices/state/noticeStore.js";
import { isAnyPopupExportActionRunning } from "./popupExportState.js";
import { EXPORT_TYPE, SUPPORTED_EXPORT_ACTION_ID } from "./popupExportContract.js";
import { sendImmediately, triggerExport } from "./popupProductActions.js";

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

test("direct send dispatch cannot bypass a disabled backend capability", async () => {
  const originalFetch = globalThis.fetch;
  let requestCalls = 0;
  globalThis.fetch = async () => {
    requestCalls++;
    throw new Error("The disabled send guard must run before a request.");
  };
  applyProductCatalogueCapabilities({
    sendToIcEnc: {
      mode: "Disabled",
      available: false,
      reason: "Send to IC-ENC is disabled.",
    },
  });

  try {
    const result = await sendImmediately(DATASET_NAME);

    assert.equal(result?.skipped, true);
    assert.equal(result?.reason, "send-to-icenc-disabled");
    assert.equal(requestCalls, 0);
    assert.equal(getNotices()[0]?.type, "danger");
    assert.doesNotMatch(getNotices()[0]?.title ?? "", /success/i);
  } finally {
    globalThis.fetch = originalFetch;
    applyProductCatalogueCapabilities({
      sendToIcEnc: {
        mode: "Simulation",
        available: true,
      },
    });
  }
});
