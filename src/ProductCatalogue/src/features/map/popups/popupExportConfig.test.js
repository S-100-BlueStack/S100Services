import assert from "node:assert/strict";
import test from "node:test";

import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { EXPORT_TARGET } from "../../data/domain/exportTarget.js";
import { PRODUCT_CORRECTIONS_LAYER_ID } from "../config/layerDefinitions.js";
import { resolveProductContext } from "../../products/domain/productContext.js";
import { createPopupExportActions } from "./popupExportConfig.js";
import { EXPORT_TYPE, isSupportedExportAction } from "./popupExportContract.js";

function createCompatibilityContext(datasetName = "AOI-001") {
  return resolveProductContext({
    attributes: {
      layerId: PRODUCT_CORRECTIONS_LAYER_ID,
      datasetName,
    },
  });
}

function createMockContext(sourceId) {
  const source = createDataSourceRegistry({ isDevelopment: true }).byId.get(sourceId);
  const layerDefinition = source.layerDefinitions[0];
  const layer = {
    customId: layerDefinition.id,
    appSourceDefinition: source,
    appSourceId: source.id,
    appSourceLabel: source.label,
    appSourceCapabilities: source.capabilities,
    appProductType: source.productType,
    appExportConfiguration: source.exportConfiguration,
  };
  const graphic = {
    layer,
    attributes: {
      sourceId: source.id,
      productKey: `${source.id}-001`,
      datasetName: `${source.id}-001`,
      productType: source.productType,
      layerId: layerDefinition.id,
      layerKind: layerDefinition.layerKind,
    },
  };
  return resolveProductContext({ graphic });
}

test("compatibility AOI renders only Edition and Update leaves", () => {
  const actions = createPopupExportActions(createCompatibilityContext());

  assert.deepEqual(
    actions.map((action) => action.label),
    [EXPORT_TYPE.EDITION, EXPORT_TYPE.UPDATE]
  );
  assert.equal(
    actions.some((action) => ["All", "S57", "S100", "S101"].includes(action.label)),
    false
  );
});

test("compatibility Edition separates S-101 presentation from the existing S100 backend target", () => {
  const context = createCompatibilityContext();
  const [edition] = createPopupExportActions(context);

  assert.equal(context.exportConfiguration.displayLabel, "S-101");
  assert.equal(context.exportConfiguration.helpText, "Open S-101 export actions.");
  assert.equal(edition.label, "Edition");
  assert.equal(edition.displayLabel, "S-101");
  assert.equal(edition.presentationLabel, "S-101 Edition");
  assert.equal(edition.helpText, "Export a new S-101 Edition for this product.");
  assert.equal(edition.backendTarget, EXPORT_TARGET.S100);
  assert.equal(edition.operationKind, EXPORT_TYPE.EDITION);
  assert.equal(edition.implemented, true);
  assert.equal(edition.enabled, true);
  assert.equal(typeof edition.handler, "function");
  assert.equal(isSupportedExportAction({ ...edition, productContext: context }), true);
});

test("compatibility Update remains a disabled placeholder without backend target", () => {
  const [, update] = createPopupExportActions(createCompatibilityContext());

  assert.equal(update.operationKind, EXPORT_TYPE.UPDATE);
  assert.equal(update.presentationLabel, "S-101 Update");
  assert.equal(update.helpText, "S-101 Update export is currently disabled.");
  assert.equal(update.implemented, false);
  assert.equal(update.enabled, false);
  assert.equal(update.backendTarget, null);
  assert.equal(update.handler, null);
  assert.match(update.availabilityReason, /backend provides an implemented update contract/i);
});

test("Paper Charts keeps source-specific parent help and disabled Edition/Update placeholders", () => {
  const context = createMockContext("paper-charts");
  const actions = createPopupExportActions(context);

  assert.equal(context.exportConfiguration.helpText, "Paper Charts export is not available yet.");

  assert.deepEqual(
    actions.map((action) => action.label),
    ["Edition", "Update"]
  );
  for (const action of actions) {
    assert.equal(action.enabled, false);
    assert.equal(action.implemented, false);
    assert.equal(action.backendTarget, null);
    assert.equal(action.handler, null);
    assert.equal(action.displayLabel, null);
    assert.equal(action.helpText, null);
    assert.match(action.availabilityReason, /Paper Charts export is not available yet/);
  }
});

test("S-102 keeps source-specific parent help and disabled Edition/Update placeholders", () => {
  const context = createMockContext("s102");
  const actions = createPopupExportActions(context);

  assert.equal(context.exportConfiguration.helpText, "S-102 export is not available yet.");

  assert.deepEqual(
    actions.map((action) => action.label),
    ["Edition", "Update"]
  );
  for (const action of actions) {
    assert.equal(action.enabled, false);
    assert.equal(action.handler, null);
    assert.equal(action.displayLabel, null);
    assert.equal(action.helpText, null);
    assert.match(action.availabilityReason, /S-102 export is not available yet/);
  }
});

test("source without popup export configuration hides Export fail closed", () => {
  const context = Object.freeze({
    sourceId: "unknown-source",
    sourceLabel: "Unknown source",
    capabilities: Object.freeze({ popupExport: true }),
    exportConfiguration: null,
  });

  assert.deepEqual(createPopupExportActions(context), []);
});
