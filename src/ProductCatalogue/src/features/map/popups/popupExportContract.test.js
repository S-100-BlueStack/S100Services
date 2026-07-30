import assert from "node:assert/strict";
import test from "node:test";

import { EXPORT_TARGET } from "../../data/domain/exportTarget.js";
import {
  EXPORT_TYPE,
  SUPPORTED_EXPORT_ACTION_ID,
  isSupportedExportAction,
  validateExportDispatch,
} from "./popupExportContract.js";

const request = async () => ({ success: true });

test("only S100 Edition with an implemented request is dispatchable", () => {
  assert.equal(
    isSupportedExportAction({
      actionId: SUPPORTED_EXPORT_ACTION_ID,
      target: EXPORT_TARGET.S100,
      exportType: EXPORT_TYPE.EDITION,
      implemented: true,
      request,
    }),
    true
  );
});

test("each disabled export leaf is rejected by the central dispatch guard", () => {
  const disabledLeaves = [
    ["export-all-edition", EXPORT_TARGET.ALL, EXPORT_TYPE.EDITION],
    ["export-all-update", EXPORT_TARGET.ALL, EXPORT_TYPE.UPDATE],
    ["s100-export-update", EXPORT_TARGET.S100, EXPORT_TYPE.UPDATE],
    ["s57-export-edition", EXPORT_TARGET.S57, EXPORT_TYPE.EDITION],
    ["s57-export-update", EXPORT_TARGET.S57, EXPORT_TYPE.UPDATE],
  ];

  for (const [actionId, target, exportType] of disabledLeaves) {
    assert.deepEqual(
      validateExportDispatch({
        actionId,
        target,
        exportType,
        implemented: false,
        request: null,
      }),
      {
        allowed: false,
        reason: "unsupported-export-action",
      }
    );
  }
});

test("stale metadata cannot enable an unsupported leaf", () => {
  assert.equal(
    isSupportedExportAction({
      actionId: SUPPORTED_EXPORT_ACTION_ID,
      target: EXPORT_TARGET.S57,
      exportType: EXPORT_TYPE.EDITION,
      implemented: true,
      request,
    }),
    false
  );

  assert.equal(
    isSupportedExportAction({
      actionId: SUPPORTED_EXPORT_ACTION_ID,
      target: EXPORT_TARGET.S100,
      exportType: EXPORT_TYPE.UPDATE,
      implemented: true,
      request,
    }),
    false
  );
});

test("missing implementation or request metadata is rejected", () => {
  assert.equal(
    isSupportedExportAction({
      actionId: SUPPORTED_EXPORT_ACTION_ID,
      target: EXPORT_TARGET.S100,
      exportType: EXPORT_TYPE.EDITION,
      implemented: false,
      request,
    }),
    false
  );

  assert.equal(
    isSupportedExportAction({
      actionId: SUPPORTED_EXPORT_ACTION_ID,
      target: EXPORT_TARGET.S100,
      exportType: EXPORT_TYPE.EDITION,
      implemented: true,
      request: null,
    }),
    false
  );
});
