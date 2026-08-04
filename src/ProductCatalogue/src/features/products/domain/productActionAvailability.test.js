import assert from "node:assert/strict";
import test from "node:test";

import {
  createProductActionAvailability,
  createProductExportAvailability,
  createSendToIcEncCapabilityAvailability,
} from "./productActionAvailability.js";

const SIMULATION_CAPABILITY = Object.freeze({
  mode: "Simulation",
  available: true,
  reason: null,
});

function createActions(options = {}) {
  return createProductActionAvailability({
    sendToIcEncCapability: SIMULATION_CAPABILITY,
    ...options,
  });
}

test("product actions are disabled when datasetName is missing", () => {
  const availability = createActions({ attributes: {}, frozen: false });
  assert.equal(availability.hasDatasetName, false);
  assert.equal(availability.freeze.disabled, true);
  assert.equal(availability.unfreeze.disabled, true);
  assert.equal(availability.sendImmediately.disabled, true);
  assert.equal(availability.rollback.disabled, true);
  assert.equal(availability.exportRoot.disabled, true);
  assert.equal(
    availability.freeze.disabledReason,
    "The selected feature does not have a datasetName."
  );
});

test("product actions remain available when state is not supplied", () => {
  const availability = createActions({
    attributes: { datasetName: "DK_TEST_PRODUCT" },
    frozen: false,
  });
  assert.equal(availability.freeze.disabled, false);
  assert.equal(availability.unfreeze.disabled, false);
  assert.equal(availability.sendImmediately.disabled, false);
  assert.equal(availability.rollback.disabled, false);
  assert.equal(availability.exportRoot.disabled, false);
});

test("simulation capability keeps the standard send action label", () => {
  const availability = createSendToIcEncCapabilityAvailability(SIMULATION_CAPABILITY);
  assert.equal(availability.disabled, false);
  assert.equal(availability.label, "Send to IC-ENC");
  assert.equal(availability.mode, "Simulation");
});

test("disabled capability disables send with backend-owned reason", () => {
  const availability = createActions({
    attributes: { datasetName: "DK_TEST_PRODUCT", status: "Exported" },
    sendToIcEncCapability: {
      mode: "Disabled",
      available: false,
      reason: "Send to IC-ENC is disabled.",
    },
  });
  assert.equal(availability.sendImmediately.disabled, true);
  assert.equal(availability.sendImmediately.disabledReason, "Send to IC-ENC is disabled.");
  assert.equal(availability.sendImmediately.label, "Send to IC-ENC");
});

test("missing or unknown capability fails closed", () => {
  assert.equal(createSendToIcEncCapabilityAvailability().disabled, true);
  assert.equal(
    createSendToIcEncCapabilityAvailability({ mode: "Live", available: true }).disabled,
    true
  );
});

test("send simulation is disabled when product is frozen", () => {
  const availability = createActions({
    attributes: { datasetName: "DK_TEST_PRODUCT", status: "Exported" },
    frozen: true,
  });
  assert.equal(availability.sendImmediately.disabled, true);
  assert.equal(availability.sendImmediately.disabledReason, "Unfreeze the product before sending.");
});

test("send simulation is disabled when known state is not Exported", () => {
  const availability = createActions({
    attributes: { datasetName: "DK_TEST_PRODUCT", status: "Idle" },
  });
  assert.equal(availability.sendImmediately.disabled, true);
  assert.equal(
    availability.sendImmediately.disabledReason,
    "IC-ENC send simulation is only available when product status is Exported."
  );
});

test("mutation actions are disabled while an export is running", () => {
  const availability = createActions({
    attributes: { datasetName: "DK_TEST_PRODUCT" },
    exportHasRunningAction: true,
  });
  assert.equal(availability.freeze.disabled, true);
  assert.equal(availability.sendImmediately.disabled, true);
  assert.equal(availability.rollback.disabled, true);
  assert.equal(availability.exportRoot.disabled, false);
  assert.equal(availability.exportRoot.loading, true);
});

test("all product actions are disabled while a product mutation is running", () => {
  const availability = createActions({
    attributes: { datasetName: "DK_TEST_PRODUCT" },
    productHasRunningMutation: true,
  });
  assert.equal(availability.freeze.disabled, true);
  assert.equal(availability.sendImmediately.disabled, true);
  assert.equal(availability.rollback.disabled, true);
  assert.equal(availability.exportRoot.disabled, true);
});

test("rollback is disabled when product status is Idle", () => {
  const availability = createActions({
    attributes: { datasetName: "DK_TEST_PRODUCT", status: 1 },
  });
  assert.equal(availability.rollback.disabled, true);
});

test("rollback is available when product status is Exported", () => {
  const availability = createActions({
    attributes: { datasetName: "DK_TEST_PRODUCT", status: "Exported" },
  });
  assert.equal(availability.rollback.disabled, false);
});

test("export leaf action is disabled when export is not implemented", () => {
  const availability = createProductExportAvailability({
    attributes: { datasetName: "DK_TEST_PRODUCT", status: 2 },
    implemented: false,
  });
  assert.equal(availability.disabled, true);
  assert.equal(availability.disabledReason, "Feature is not available yet.");
});

test("export leaf action is disabled when product is frozen", () => {
  const availability = createProductExportAvailability({
    attributes: { datasetName: "DK_TEST_PRODUCT", status: 5 },
    frozen: true,
    implemented: true,
  });
  assert.equal(availability.disabled, true);
  assert.equal(availability.disabledReason, "Unfreeze the product before exporting.");
});

test("implemented New Edition is disabled when status is Exported", () => {
  const availability = createProductExportAvailability({
    attributes: { datasetName: "DK_TEST_PRODUCT", status: "Exported" },
    implemented: true,
  });
  assert.equal(availability.disabled, true);
  assert.equal(
    availability.disabledReason,
    "New Edition is only available when product status is Idle."
  );
});

test("implemented New Edition is available when status is Idle", () => {
  const availability = createProductExportAvailability({
    attributes: { datasetName: "DK_TEST_PRODUCT", status: 1 },
    implemented: true,
    exportState: { running: false, blocked: false, disabledReason: null },
  });
  assert.equal(availability.disabled, false);
});

test("export leaf action exposes loading state when that export is running", () => {
  const availability = createProductExportAvailability({
    attributes: { datasetName: "DK_TEST_PRODUCT" },
    implemented: true,
    exportState: {
      running: true,
      disabledReason: "All edition is already running for DK_TEST_PRODUCT.",
    },
  });

  assert.equal(availability.disabled, true);
  assert.equal(availability.loading, true);
  assert.equal(availability.label, "Exporting...");
  assert.equal(availability.disabledReason, "All edition is already running for DK_TEST_PRODUCT.");
});

test("export leaf action is blocked by conflicting export state", () => {
  const availability = createProductExportAvailability({
    attributes: { datasetName: "DK_TEST_PRODUCT" },
    implemented: true,
    exportState: {
      running: false,
      blocked: true,
      disabledReason: "All update is already running for DK_TEST_PRODUCT.",
    },
  });

  assert.equal(availability.disabled, true);
  assert.equal(availability.loading, false);
  assert.equal(availability.disabledReason, "All update is already running for DK_TEST_PRODUCT.");
});
