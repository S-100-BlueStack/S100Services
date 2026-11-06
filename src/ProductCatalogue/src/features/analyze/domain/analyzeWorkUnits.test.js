import assert from "node:assert/strict";
import test from "node:test";
import { reconcileAnalyzeResolutions } from "./analyzeWorkUnits.js";

function packageResolution(requestedDatasetName = "Primary", secondary = "Secondary") {
  return {
    status: "resolved",
    requestedDatasetName,
    product: { datasetName: "Primary", sourceId: "owner-test", identityKey: "owner-product" },
    workUnit: {
      kind: "package",
      identityKey: "package-test",
      primaryMemberKey: "first",
      members: [
        { key: "first", sourceId: "owner-test", datasetName: "Primary" },
        { key: "second", sourceId: "member-test", datasetName: secondary },
      ],
    },
  };
}
function simple(name, status = "resolved") {
  return {
    status,
    requestedDatasetName: name,
    product: status === "resolved" ? { datasetName: name } : null,
    workUnit: null,
  };
}

test("later proof occupies the first alias occurrence without reordering independent simple work units", () => {
  const result = reconcileAnalyzeResolutions([
    simple("Before"),
    simple("Secondary", "failed"),
    simple("Between"),
    packageResolution(),
    simple("After"),
  ]);
  assert.deepEqual(
    result.map((item) => item.product.datasetName),
    ["Before", "Primary", "Between", "After"]
  );
  assert.equal(result[1].requestedDatasetName, "Secondary");
});

test("complete package proof replaces earlier or later simple member results only for its own aliases", () => {
  const result = reconcileAnalyzeResolutions([
    simple("Secondary"),
    packageResolution(),
    simple("Other"),
    simple("primary"),
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].workUnit.kind, "package");
  assert.equal(result[1].product.datasetName, "Other");
});

test("consistent successful duplicate package claims reconcile into one complete result", () => {
  const result = reconcileAnalyzeResolutions([packageResolution("Secondary"), packageResolution()]);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "resolved");
  assert.equal(result[0].requestedDatasetName, "Secondary");
});

test("same package identity with contradictory concrete members fails closed", () => {
  const result = reconcileAnalyzeResolutions([
    packageResolution(),
    packageResolution("Replacement secondary", "Replacement secondary"),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "failed");
  assert.equal(result[0].product, null);
  assert.equal(result[0].workUnit, null);
});

test("transitively overlapping ownership claims produce one failed component and preserve independent units", () => {
  const first = packageResolution();
  const second = packageResolution("Other primary", "Secondary");
  second.product = { ...first.product, datasetName: "Other primary", identityKey: "other-product" };
  second.workUnit = {
    ...second.workUnit,
    identityKey: "other-package",
    members: [
      { ...first.workUnit.members[0], datasetName: "Other primary" },
      first.workUnit.members[1],
    ],
  };
  const third = packageResolution("Third primary", "Other primary");
  third.product = { ...first.product, datasetName: "Third primary", identityKey: "third-product" };
  third.workUnit = {
    ...third.workUnit,
    identityKey: "third-package",
    members: [
      { ...first.workUnit.members[0], datasetName: "Third primary" },
      { ...first.workUnit.members[1], datasetName: "Other primary" },
    ],
  };
  const result = reconcileAnalyzeResolutions([first, simple("Independent"), second, third]);
  assert.equal(result.length, 2);
  assert.equal(result[0].status, "failed");
  assert.equal(result[1].product.datasetName, "Independent");
});

test("unproven failures remain exact and unrelated simple identities remain independent", () => {
  const failures = [
    simple("Unknown member", "failed"),
    simple("Ordinary one"),
    simple("Ordinary two"),
  ];
  assert.deepEqual(reconcileAnalyzeResolutions(failures), failures);
});
