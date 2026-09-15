import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCT_EXPORT_STANDARD,
  createProductExportStandardLabel,
  findProductExportMetadataItem,
  normalizeProductExportStandard,
} from "./productExportTrack.js";

test("Product export standards normalize backend and UI aliases", () => {
  assert.equal(normalizeProductExportStandard("S100"), PRODUCT_EXPORT_STANDARD.S100);
  assert.equal(normalizeProductExportStandard("S-101"), PRODUCT_EXPORT_STANDARD.S100);
  assert.equal(normalizeProductExportStandard("s57"), PRODUCT_EXPORT_STANDARD.S57);
  assert.equal(createProductExportStandardLabel(PRODUCT_EXPORT_STANDARD.S100), "S-101");
  assert.equal(createProductExportStandardLabel(PRODUCT_EXPORT_STANDARD.S57), "S-57");
});

test("Product export metadata selection resolves only a requested known standard", () => {
  const exportMetadata = {
    byStandard: {
      S100: { standard: "S100", status: "Idle" },
      S57: { standard: "S57", status: "ReadyForDistribution" },
    },
  };

  assert.equal(findProductExportMetadataItem(exportMetadata, ["S-101"])?.status, "Idle");
  assert.equal(
    findProductExportMetadataItem(exportMetadata, ["unknown", "s57"])?.status,
    "ReadyForDistribution"
  );
  assert.equal(findProductExportMetadataItem(exportMetadata, ["Paper Charts"]), null);
});
