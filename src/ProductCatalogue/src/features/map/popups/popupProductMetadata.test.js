import assert from "node:assert/strict";
import test from "node:test";

import { createPopupProductMetadataColumns } from "./popupProductMetadata.js";

function exportMetadata(items) {
  const byStandard = Object.fromEntries(items.map((item) => [item.standard, item]));
  return { standards: items.map((item) => item.standard), byStandard };
}

test("S-101 popup keeps one source-local column and folds matching export metadata into it", () => {
  const columns = createPopupProductMetadataColumns({
    sourceId: "s101",
    sourceLabel: "S-101",
    edition: 4,
    update: 2,
    status: 1,
    exportMetadata: exportMetadata([
      { standard: "S100", label: "S-101", edition: 5, update: 0, status: 11 },
    ]),
  });

  assert.equal(columns.length, 1);
  assert.equal(columns[0].label, "S-101");
  assert.deepEqual(columns[0].item, {
    edition: 5,
    update: 0,
    status: 11,
    date: undefined,
    errorMessage: undefined,
    validationArtifacts: [],
  });
});

test("S-57 popup ignores related S-101 tracks and shows only the selected source metadata", () => {
  const columns = createPopupProductMetadataColumns({
    sourceId: "s57",
    sourceLabel: "S-57",
    edition: 3,
    update: 7,
    status: 1,
    exportMetadata: exportMetadata([
      { standard: "S100", label: "S-101", edition: 12, update: 4, status: 11 },
    ]),
  });

  assert.equal(columns.length, 1);
  assert.equal(columns[0].label, "S-57");
  assert.equal(columns[0].item.edition, 3);
  assert.equal(columns[0].item.update, 7);
  assert.equal(columns[0].item.status, 1);
});

test("failed S-57 export enriches the S-57 column instead of adding another column", () => {
  const artifact = { fileName: "validation.txt", url: "/api/validation.txt" };
  const columns = createPopupProductMetadataColumns({
    sourceId: "s57",
    sourceLabel: "S-57",
    edition: 3,
    update: 7,
    status: 1,
    exportMetadata: exportMetadata([
      { standard: "S100", label: "S-101", edition: 12, update: 4, status: 11 },
      {
        standard: "S57",
        label: "S-57",
        edition: 4,
        update: 0,
        status: 15,
        errorMessage: "Validation failed",
        validationArtifacts: [artifact],
      },
    ]),
  });

  assert.equal(columns.length, 1);
  assert.equal(columns[0].label, "S-57");
  assert.equal(columns[0].item.edition, 4);
  assert.equal(columns[0].item.update, 0);
  assert.equal(columns[0].item.status, 15);
  assert.equal(columns[0].item.errorMessage, "Validation failed");
  assert.deepEqual(columns[0].item.validationArtifacts, [artifact]);
});
