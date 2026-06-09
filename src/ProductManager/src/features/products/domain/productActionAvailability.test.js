import assert from "node:assert/strict";
import test from "node:test";

import {
  createProductActionAvailability,
  createProductExportAvailability,
} from "./productActionAvailability.js";

test("product actions are disabled when datasetName is missing", () => {
  const availability = createProductActionAvailability({
    attributes: {},
    frozen: false,
  });

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

test("product actions are available when datasetName exists and no operation is running", () => {
  const availability = createProductActionAvailability({
    attributes: {
      datasetName: "DK_TEST_PRODUCT",
    },
    frozen: false,
  });

  assert.equal(availability.datasetName, "DK_TEST_PRODUCT");
  assert.equal(availability.hasDatasetName, true);
  assert.equal(availability.freeze.disabled, false);
  assert.equal(availability.unfreeze.disabled, false);
  assert.equal(availability.sendImmediately.disabled, false);
  assert.equal(availability.rollback.disabled, false);
  assert.equal(availability.exportRoot.disabled, false);
});

test("send immediately is disabled when the product is frozen", () => {
  const availability = createProductActionAvailability({
    attributes: {
      datasetName: "DK_TEST_PRODUCT",
    },
    frozen: true,
  });

  assert.equal(availability.freeze.disabled, false);
  assert.equal(availability.unfreeze.disabled, false);
  assert.equal(availability.sendImmediately.disabled, true);
  assert.equal(availability.sendImmediately.disabledReason, "Unfreeze the product before sending.");
});

test("mutation actions are disabled while an export is running", () => {
  const availability = createProductActionAvailability({
    attributes: {
      datasetName: "DK_TEST_PRODUCT",
    },
    frozen: false,
    exportHasRunningAction: true,
  });

  assert.equal(availability.freeze.disabled, true);
  assert.equal(availability.unfreeze.disabled, true);
  assert.equal(availability.sendImmediately.disabled, true);
  assert.equal(availability.rollback.disabled, true);
  assert.equal(availability.freeze.disabledReason, "Wait until the current export finishes.");

  // The root export action must remain openable so users can inspect which
  // leaf action is running and why other export options are blocked.
  assert.equal(availability.exportRoot.disabled, false);
  assert.equal(availability.exportRoot.label, "Exporting...");
});

test("all product actions are disabled while a product mutation is running", () => {
  const availability = createProductActionAvailability({
    attributes: {
      datasetName: "DK_TEST_PRODUCT",
    },
    frozen: false,
    productHasRunningMutation: true,
  });

  assert.equal(availability.freeze.disabled, true);
  assert.equal(availability.unfreeze.disabled, true);
  assert.equal(availability.sendImmediately.disabled, true);
  assert.equal(availability.rollback.disabled, true);
  assert.equal(availability.exportRoot.disabled, true);
  assert.equal(
    availability.freeze.disabledReason,
    "Wait until the current product operation finishes."
  );
});

test("export leaf action is disabled when export is not implemented", () => {
  const availability = createProductExportAvailability({
    attributes: {
      datasetName: "DK_TEST_PRODUCT",
    },
    frozen: false,
    implemented: false,
  });

  assert.equal(availability.disabled, true);
  assert.equal(availability.disabledReason, "Feature is not available yet.");
});

test("export leaf action is disabled when product is frozen", () => {
  const availability = createProductExportAvailability({
    attributes: {
      datasetName: "DK_TEST_PRODUCT",
    },
    frozen: true,
    implemented: true,
  });

  assert.equal(availability.disabled, true);
  assert.equal(availability.disabledReason, "Unfreeze the product before exporting.");
});

test("export leaf action exposes loading state when that export is running", () => {
  const availability = createProductExportAvailability({
    attributes: {
      datasetName: "DK_TEST_PRODUCT",
    },
    frozen: false,
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
    attributes: {
      datasetName: "DK_TEST_PRODUCT",
    },
    frozen: false,
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

test("export leaf action is available when implemented and no blocker exists", () => {
  const availability = createProductExportAvailability({
    attributes: {
      datasetName: "DK_TEST_PRODUCT",
    },
    frozen: false,
    implemented: true,
    exportState: {
      running: false,
      blocked: false,
      disabledReason: null,
    },
  });

  assert.equal(availability.disabled, false);
  assert.equal(availability.loading, false);
  assert.equal(availability.disabledReason, null);
});
