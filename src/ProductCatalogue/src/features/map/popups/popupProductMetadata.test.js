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

const packageContext = {
  workUnit: {
    kind: "package",
    primaryMemberKey: "s101",
    members: [
      { key: "s101", label: "S-101", exportStandard: "S100" },
      { key: "s57", label: "S-57", exportStandard: "S57" },
    ],
  },
};
const packageAttributes = {
  status: 1,
  workUnitMetadata: {
    members: {
      s101: { datasetName: "PRIMARY", edition: 2, update: 4, issueDate: "A" },
      s57: { datasetName: "OTHER", edition: 7, update: 0, issueDate: "B" },
    },
  },
  workUnitStatus: {
    workflowStatus: 1,
    members: [
      { key: "s101", status: 11 },
      { key: "s57", status: 15 },
    ],
  },
};
test("package current members render without exports and never borrow workflow status", () => {
  const columns = createPopupProductMetadataColumns(packageAttributes, packageContext);
  assert.deepEqual(
    columns.map(({ item }) => [item.datasetName, item.edition, item.update, item.status]),
    [
      ["PRIMARY", 2, 4, 11],
      ["OTHER", 7, 0, 15],
    ]
  );
  assert.ok(
    columns.every(
      ({ presentation }) =>
        presentation.productIdentity && presentation.statusCell && presentation.compactError
    )
  );
});
for (const [standard, key, index] of [
  ["S100", "s101", 0],
  ["S57", "s57", 1],
]) {
  test(`candidate overlay remains local to ${key}`, () => {
    const current = createPopupProductMetadataColumns(packageAttributes, packageContext);
    const attributes = {
      ...packageAttributes,
      exportMetadata: exportMetadata([
        {
          standard,
          datasetName: packageAttributes.workUnitMetadata.members[key].datasetName,
          edition: 9,
          update: 1,
          status: 15,
          errorMessage: "Failed",
        },
      ]),
    };
    const columns = createPopupProductMetadataColumns(attributes, packageContext);
    assert.equal(columns[index].item.edition, 9);
    assert.equal(columns[index].item.errorMessage, "Failed");
    assert.deepEqual(columns[1 - index], current[1 - index]);
    assert.equal(columns[index].item.datasetName, current[index].item.datasetName);
  });
}
test("contradictory candidate identity cannot override current package member", () => {
  const value = createPopupProductMetadataColumns(
    {
      ...packageAttributes,
      exportMetadata: exportMetadata([{ standard: "S57", datasetName: "WRONG", edition: 9 }]),
    },
    packageContext
  );
  assert.equal(value[1].item.edition, 7);
});
