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

test("detail keeps aggregate, compatibility and exact nested member observations separate", () => {
  const detail = normalizeElectronicProductResponse({
    Data: {
      Name: "PRIMARY",
      Status: 15,
      ErrorMessage: "Aggregate compatibility diagnostic",
      S101: { Name: "PRIMARY", Status: 8, Edition: 4 },
      S57: { Name: "OTHER", Status: 8 },
      Package: {
        Layer: 1,
        sourceDatasetName: "primary",
        Status: "Error",
        ErrorMessage: "Aggregate diagnostic",
        S101: { DatasetName: "PRIMARY", Status: "11", errorMessage: null },
        s57: { datasetName: "OTHER", status: 15, ErrorMessage: "Member failure" },
      },
    },
  });
  assert.equal(detail.status, 15);
  assert.equal(detail.errorMessage, "Aggregate compatibility diagnostic");
  assert.equal(detail.packageStatus, 4);
  assert.equal(detail.workUnitMetadata.members.s101.edition, 4);
  assert.deepEqual(detail.packageStatusObservation, {
    sourceDatasetName: "primary",
    status: 4,
    errorMessage: "Aggregate diagnostic",
    members: {
      s101: { datasetName: "PRIMARY", status: 11, errorMessage: null },
      s57: { datasetName: "OTHER", status: 15, errorMessage: "Member failure" },
    },
  });
  assert.deepEqual(
    normalizeElectronicProductResponse(detail).packageStatusObservation,
    detail.packageStatusObservation
  );
});

test("detail preserves unknown, omitted and explicitly cleared member fields", () => {
  const normalize = (pkg) =>
    normalizeElectronicProductResponse({ name: "PRIMARY", package: pkg }).packageStatusObservation;
  const snapshot = normalize({
    s101: { datasetName: "PRIMARY", status: 99, errorMessage: " " },
    s57: { datasetName: "OTHER", Status: "5" },
  });
  assert.deepEqual(snapshot.members.s101, {
    datasetName: "PRIMARY",
    status: undefined,
    errorMessage: null,
  });
  assert.deepEqual(snapshot.members.s57, {
    datasetName: "OTHER",
    status: 5,
    errorMessage: undefined,
  });
  assert.equal(snapshot.errorMessage, undefined);
  assert.equal(normalize({ Layer: 9 }), undefined);
  assert.equal(normalize({ s101: { DatasetName: "PRIMARY", ProductSpecification: 0 } }), undefined);
});
