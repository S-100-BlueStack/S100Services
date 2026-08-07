import assert from "node:assert/strict";
import test from "node:test";

import {
  beginPopupExportAction,
  clearPopupExportUiState,
  endPopupExportAction,
  getPopupExportActionState,
  isAnyPopupExportActionRunning,
} from "./popupExportState.js";

if (!globalThis.document) {
  globalThis.document = new EventTarget();
}

test("Edition loading state is isolated to the selected Product and leaf", () => {
  const started = beginPopupExportAction({
    datasetName: "PRODUCT-A",
    scope: "S100",
    exportType: "Edition",
  });

  assert.equal(started.started, true);
  assert.equal(
    getPopupExportActionState({
      datasetName: "PRODUCT-A",
      scope: "S100",
      exportType: "Edition",
    }).loading,
    true
  );
  assert.equal(
    getPopupExportActionState({
      datasetName: "PRODUCT-A",
      scope: "S100",
      exportType: "Update",
    }).loading,
    false
  );
  assert.equal(
    getPopupExportActionState({
      datasetName: "PRODUCT-B",
      scope: "S100",
      exportType: "Edition",
    }).blocked,
    false
  );

  endPopupExportAction(started.key);
});

test("Product context and legacy dataset calls resolve the same current identity", () => {
  const productContext = Object.freeze({
    sourceId: "compatibility-aoi",
    productKey: "PRODUCT-C",
    datasetName: "PRODUCT-C",
  });
  const started = beginPopupExportAction({
    datasetName: "PRODUCT-C",
    scope: "S100",
    exportType: "Edition",
  });

  assert.equal(isAnyPopupExportActionRunning(productContext), true);
  assert.equal(
    getPopupExportActionState({
      productContext,
      scope: "S100",
      exportType: "Edition",
    }).running,
    true
  );

  endPopupExportAction(started.key);
});

test("source cleanup also clears dataset-backed state started with Product context", () => {
  const productContext = Object.freeze({
    sourceId: "paper-charts",
    productKey: "PAPER-DATASET-001",
    datasetName: "PAPER-DATASET-001",
  });
  const started = beginPopupExportAction({
    productContext,
    scope: "paper-charts",
    exportType: "Edition",
  });

  assert.equal(started.started, true);
  assert.equal(clearPopupExportUiState({ sourceId: "paper-charts" }), 1);
  assert.equal(isAnyPopupExportActionRunning(productContext), false);

  endPopupExportAction(started.key);
});

test("source lifecycle cleanup clears only local source UI state", () => {
  const paper = beginPopupExportAction({
    sourceId: "paper-charts",
    productKey: "PAPER-001",
    scope: "paper-charts",
    exportType: "Edition",
  });
  const s102 = beginPopupExportAction({
    sourceId: "s102",
    productKey: "S102-001",
    scope: "s102",
    exportType: "Edition",
  });

  assert.equal(clearPopupExportUiState({ sourceId: "paper-charts" }), 1);
  assert.equal(
    isAnyPopupExportActionRunning({
      sourceId: "paper-charts",
      productKey: "PAPER-001",
    }),
    false
  );
  assert.equal(isAnyPopupExportActionRunning({ sourceId: "s102", productKey: "S102-001" }), true);

  endPopupExportAction(paper.key);
  endPopupExportAction(s102.key);
});
