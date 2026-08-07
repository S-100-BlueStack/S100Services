import assert from "node:assert/strict";
import test from "node:test";

import { EXPORT_TARGET } from "../../data/domain/exportTarget.js";
import { PRODUCT_CORRECTIONS_LAYER_ID } from "../config/layerDefinitions.js";
import { resolveProductContext } from "../../products/domain/productContext.js";
import {
  EXPORT_TYPE,
  SUPPORTED_EXPORT_ACTION_ID,
  isSupportedExportAction,
  validateExportDispatch,
} from "./popupExportContract.js";

const request = async () => ({ success: true });
const compatibilityContext = resolveProductContext({
  attributes: {
    layerId: PRODUCT_CORRECTIONS_LAYER_ID,
    datasetName: "AOI-001",
  },
});

test("only the implemented compatibility Edition tuple is dispatchable", () => {
  assert.equal(
    isSupportedExportAction({
      actionId: SUPPORTED_EXPORT_ACTION_ID,
      target: EXPORT_TARGET.S100,
      exportType: EXPORT_TYPE.EDITION,
      implemented: true,
      request,
      productContext: compatibilityContext,
    }),
    true
  );
});

test("Update and source placeholders are rejected by the dispatch guard", () => {
  for (const action of [
    {
      actionId: "export-update",
      target: null,
      exportType: EXPORT_TYPE.UPDATE,
      implemented: false,
      request: null,
    },
    {
      actionId: "export-edition",
      target: null,
      exportType: EXPORT_TYPE.EDITION,
      implemented: false,
      request: null,
    },
  ]) {
    assert.deepEqual(validateExportDispatch(action), {
      allowed: false,
      reason: "unsupported-export-action",
    });
  }
});

test("stale backend target or operation metadata cannot enable another leaf", () => {
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

test("a Product context without export capability rejects otherwise valid metadata", () => {
  const unsupportedContext = Object.freeze({
    sourceId: "paper-charts",
    capabilities: Object.freeze({ exportEdition: false }),
  });

  assert.equal(
    isSupportedExportAction({
      actionId: SUPPORTED_EXPORT_ACTION_ID,
      target: EXPORT_TARGET.S100,
      exportType: EXPORT_TYPE.EDITION,
      implemented: true,
      request,
      productContext: unsupportedContext,
    }),
    false
  );
});
