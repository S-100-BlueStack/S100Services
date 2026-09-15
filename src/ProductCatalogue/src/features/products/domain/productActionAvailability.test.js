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

function createSelectedExportAttributes({
  sourceLabel = "S-101",
  exportStatus,
  topLevelStatus = 1,
  exports,
} = {}) {
  const exportRecords = exports ?? [
    {
      Type: sourceLabel === "S-57" ? "S57" : "S100",
      Status: exportStatus,
    },
  ];

  const items = exportRecords.map((record) => ({
    standard: record.Type === "S57" ? "S57" : "S100",
    status: record.Status,
  }));

  return {
    datasetName: "DK_TEST_PRODUCT",
    sourceLabel,
    status: topLevelStatus,
    exportMetadata: {
      standards: items.map((item) => item.standard),
      byStandard: Object.fromEntries(items.map((item) => [item.standard, item])),
    },
  };
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

test("state-dependent actions fail closed when state is not supplied", () => {
  const availability = createActions({
    attributes: { datasetName: "DK_TEST_PRODUCT" },
    frozen: false,
  });
  assert.equal(availability.freeze.disabled, false);
  assert.equal(availability.unfreeze.disabled, false);
  assert.equal(availability.sendImmediately.disabled, true);
  assert.equal(availability.rollback.disabled, true);
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
    attributes: { datasetName: "DK_TEST_PRODUCT", status: "ReadyForDistribution" },
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
    attributes: { datasetName: "DK_TEST_PRODUCT", status: "ReadyForDistribution" },
    frozen: true,
  });
  assert.equal(availability.sendImmediately.disabled, true);
  assert.equal(availability.sendImmediately.disabledReason, "Unfreeze the product before sending.");
});

test("send simulation is disabled when known state is not ReadyForDistribution", () => {
  const availability = createActions({
    attributes: { datasetName: "DK_TEST_PRODUCT", status: "Idle" },
  });
  assert.equal(availability.sendImmediately.disabled, true);
  assert.equal(
    availability.sendImmediately.disabledReason,
    "IC-ENC send simulation is only available when product status is ReadyForDistribution."
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

test("Cancel Export fails closed when selected-source export metadata is unavailable", () => {
  const availability = createActions({
    attributes: { datasetName: "DK_TEST_PRODUCT", sourceLabel: "S-101", status: 11 },
  });

  assert.equal(availability.rollback.disabled, true);
  assert.equal(
    availability.rollback.disabledReason,
    "Cancel Export requires an unverified candidate for the selected source."
  );
});

test("Cancel Export uses the selected-source export track instead of the top-level Product state", () => {
  const availability = createActions({
    attributes: createSelectedExportAttributes({ exportStatus: 11, topLevelStatus: 1 }),
  });

  assert.equal(availability.rollback.disabled, false);
});

test("Cancel Export is available for a selected-source export error candidate", () => {
  const availability = createActions({
    attributes: createSelectedExportAttributes({
      sourceLabel: "S-57",
      exportStatus: "Error",
      topLevelStatus: "Idle",
    }),
  });

  assert.equal(availability.rollback.disabled, false);
});

test("Cancel Export ignores a cancelable track from another Product source", () => {
  const availability = createActions({
    attributes: createSelectedExportAttributes({
      sourceLabel: "S-101",
      exports: [
        { Type: "S100", Status: "Idle" },
        { Type: "S57", Status: "ReadyForDistribution" },
      ],
    }),
  });

  assert.equal(availability.rollback.disabled, true);
});

test("Cancel Export is disabled after the selected-source candidate was cancelled", () => {
  const availability = createActions({
    attributes: createSelectedExportAttributes({ exportStatus: "Cancelled" }),
  });

  assert.equal(availability.rollback.disabled, true);
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

test("implemented New Edition is disabled when status is ReadyForDistribution", () => {
  const availability = createProductExportAvailability({
    attributes: { datasetName: "DK_TEST_PRODUCT", status: "ReadyForDistribution" },
    implemented: true,
  });
  assert.equal(availability.disabled, true);
  assert.equal(availability.disabledReason, "Export is unavailable in the current workflow state.");
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
