import assert from "node:assert/strict";
import test from "node:test";

import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { PRODUCT_CORRECTIONS_LAYER_ID } from "../../map/config/layerDefinitions.js";
import { createProductActionAvailability } from "./productActionAvailability.js";
import { resolveProductContext } from "./productContext.js";

const SIMULATION_CAPABILITY = Object.freeze({
  mode: "Simulation",
  available: true,
  reason: null,
});

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

test("compatibility AOI keeps supported mutation actions", () => {
  const attributes = {
    layerId: PRODUCT_CORRECTIONS_LAYER_ID,
    datasetName: "AOI-001",
    status: "Exported",
  };
  const productContext = resolveProductContext({ attributes });
  const availability = createProductActionAvailability({
    attributes,
    productContext,
    sendToIcEncCapability: SIMULATION_CAPABILITY,
  });

  assert.equal(availability.freeze.visible, true);
  assert.equal(availability.freeze.disabled, false);
  assert.equal(availability.sendImmediately.visible, true);
  assert.equal(availability.rollback.visible, true);
});

test("Paper Charts exposes no mutation actions", () => {
  const productContext = createMockContext("paper-charts");
  const availability = createProductActionAvailability({
    attributes: { datasetName: productContext.datasetName },
    productContext,
    sendToIcEncCapability: SIMULATION_CAPABILITY,
  });

  assert.equal(availability.freeze.visible, false);
  assert.equal(availability.unfreeze.visible, false);
  assert.equal(availability.sendImmediately.visible, false);
  assert.equal(availability.rollback.visible, false);
  assert.equal(availability.exportRoot.visible, true);
});

test("S-102 exposes no mutation actions", () => {
  const productContext = createMockContext("s102");
  const availability = createProductActionAvailability({
    attributes: { datasetName: productContext.datasetName },
    productContext,
    sendToIcEncCapability: SIMULATION_CAPABILITY,
  });

  assert.equal(availability.freeze.visible, false);
  assert.equal(availability.sendImmediately.visible, false);
  assert.equal(availability.rollback.visible, false);
});

test("unknown capabilities remain hidden and disabled", () => {
  const productContext = Object.freeze({
    sourceId: "future-source",
    sourceLabel: "Future Source",
    capabilities: Object.freeze({ popupExport: false }),
  });
  const availability = createProductActionAvailability({
    attributes: { datasetName: "FUTURE-001" },
    productContext,
    sendToIcEncCapability: SIMULATION_CAPABILITY,
  });

  assert.equal(availability.freeze.visible, false);
  assert.equal(availability.freeze.disabled, true);
  assert.equal(availability.exportRoot.visible, false);
});

test("active job blocking remains effective for compatibility actions", () => {
  const attributes = {
    layerId: PRODUCT_CORRECTIONS_LAYER_ID,
    datasetName: "AOI-JOB-001",
  };
  const productContext = resolveProductContext({ attributes });
  const availability = createProductActionAvailability({
    attributes,
    productContext,
    productHasRunningMutation: true,
    productOperationDisabledReason: "A product operation is already running.",
    sendToIcEncCapability: SIMULATION_CAPABILITY,
  });

  assert.equal(availability.freeze.disabled, true);
  assert.equal(availability.exportRoot.disabled, true);
  assert.equal(availability.freeze.disabledReason, "A product operation is already running.");
});
