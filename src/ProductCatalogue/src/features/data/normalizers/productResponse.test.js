import assert from "node:assert/strict";
import test from "node:test";
import { normalizeElectronicProductResponse } from "../normalizers/productResponse.js";
test("Product detail preserves both current products separately from active export metadata", () => {
  const result = normalizeElectronicProductResponse({
    Name: "PRIMARY",
    Status: 1,
    S101: { Name: "PRIMARY", Edition: 2, Update: 4, IssueDate: "A" },
    s57: { name: "OTHER", edition: 7, update: 0, issueDate: "B" },
    Exports: [{ Type: "S57", Name: "OTHER", Edition: 8, Update: 0, Status: 15 }],
  });
  assert.equal(result.status, 1);
  assert.equal(result.workUnitMetadata.members.s101.edition, 2);
  assert.equal(result.workUnitMetadata.members.s57.edition, 7);
  assert.equal(result.workUnitMetadata.members.s57.datasetName, "OTHER");
  assert.equal(result.exportMetadata.byStandard.S57.edition, 8);
  assert.equal(
    normalizeElectronicProductResponse({ Name: "PRIMARY", S101: { Name: "PRIMARY" }, Exports: [] })
      .workUnitMetadata.members.s57,
    undefined
  );
});

test("Product detail carries the backend aggregate Package status without conflating ProductState", () => {
  const result = normalizeElectronicProductResponse({
    DatasetName: "PRIMARY",
    Status: 11,
    Package: { Status: 5 },
    S101: { DatasetName: "PRIMARY", Status: 11 },
    S57: { DatasetName: "SECONDARY", Status: 15 },
  });
  assert.equal(result.status, 11);
  assert.equal(result.packageStatus, 5);
  assert.equal(
    normalizeElectronicProductResponse({
      DatasetName: "PRIMARY",
      Status: 11,
      Package: { Status: 999 },
    }).packageStatus,
    undefined
  );
  assert.equal(
    Object.hasOwn(
      normalizeElectronicProductResponse({ DatasetName: "ORDINARY", Status: 11 }),
      "packageStatus"
    ),
    false
  );
});
