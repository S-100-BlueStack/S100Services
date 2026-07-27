import assert from "node:assert/strict";
import test from "node:test";

import {
  getExternalProductExportState,
  hasRunningProductExportOperation,
  mergeProductExportStates,
} from "./productExternalExportState.js";

const productOperationState = {
  operations: [
    {
      type: "export",
      datasetName: "101DK0040943E",
      label: "Exporting S100 Edition",
      exportTarget: "S100",
      exportType: "Edition",
    },
  ],
};

test("external S100 Edition job is exposed as the running export leaf", () => {
  const state = getExternalProductExportState({
    productOperationState,
    target: "S100",
    exportType: "Edition",
  });

  assert.equal(hasRunningProductExportOperation(productOperationState), true);
  assert.equal(state.running, true);
  assert.equal(state.blocked, true);
  assert.equal(state.loading, true);
  assert.match(state.disabledReason, /Exporting S100 Edition/);
});

test("external S100 export blocks All but not S57", () => {
  const allState = getExternalProductExportState({
    productOperationState,
    target: "All",
    exportType: "Edition",
  });
  const s57State = getExternalProductExportState({
    productOperationState,
    target: "S57",
    exportType: "Edition",
  });

  assert.equal(allState.running, false);
  assert.equal(allState.blocked, true);
  assert.equal(s57State.blocked, false);
});

test("local export state remains authoritative in the initiating tab", () => {
  const localState = {
    running: true,
    blocked: true,
    loading: true,
    disabledReason: "Local export is running.",
  };
  const externalState = getExternalProductExportState({
    productOperationState,
    target: "S100",
    exportType: "Edition",
  });

  assert.equal(mergeProductExportStates(localState, externalState), localState);
});
