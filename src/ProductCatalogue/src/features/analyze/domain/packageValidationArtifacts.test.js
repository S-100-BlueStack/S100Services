import assert from "node:assert/strict";
import test from "node:test";
import { selectPackageValidationArtifacts } from "./packageValidationArtifacts.js";

const context = (datasetName = "Exact Product", specification = 101) => ({
  datasetName,
  data: { attributes: { productSpecification: specification } },
});
const record = (overrides = {}) => ({
  id: "artifact",
  trackId: "track",
  datasetName: "Exact Product",
  productSpecification: "S101",
  revisionId: "revision",
  url: "/original-owner-url",
  ...overrides,
});

test("artifact identity requires both dataset and specification and preserves original records", () => {
  const first = record();
  const other = record({
    id: "other-artifact",
    trackId: "other-track",
    productSpecification: "S57",
  });
  const history = [first, other];
  const selection = selectPackageValidationArtifacts(history, context());
  assert.deepEqual(selection, { artifacts: [first], hasUnattributedArtifacts: false });
  assert.equal(selection.artifacts[0], first);
  assert.deepEqual(
    selectPackageValidationArtifacts(history, context("Exact Product", 57)).artifacts,
    [other]
  );
});

test("ownership normalization preserves concrete names and accepts registry specification forms", () => {
  const artifact = record({ datasetName: " exact product ", productSpecification: "s-101" });
  assert.equal(selectPackageValidationArtifacts([artifact], context()).artifacts[0], artifact);
  assert.deepEqual(
    selectPackageValidationArtifacts([record({ datasetName: "Exact Product suffix" })], context())
      .artifacts,
    []
  );
  assert.deepEqual(
    selectPackageValidationArtifacts([record({ productSpecification: 101 })], context()).artifacts
      .length,
    1
  );
});

for (const overrides of [
  { datasetName: null },
  { datasetName: "" },
  { productSpecification: null },
  { productSpecification: "S128" },
  { productSpecification: "Unknown" },
]) {
  test(`missing or unknown ownership fails closed: ${JSON.stringify(overrides)}`, () => {
    assert.deepEqual(selectPackageValidationArtifacts([record(overrides)], context()), {
      artifacts: [],
      hasUnattributedArtifacts: true,
    });
  });
}

for (const field of ["id", "trackId"]) {
  test(`conflicting ${field} claims cannot publish an artifact under either owner`, () => {
    const first = record();
    const second = record({
      id: "different-artifact",
      trackId: "different-track",
      datasetName: "Related Product",
      productSpecification: "S57",
      [field]: first[field],
    });
    const history = [first, second];
    for (const owner of [context(), context("Related Product", 57)]) {
      assert.deepEqual(selectPackageValidationArtifacts(history, owner), {
        artifacts: [],
        hasUnattributedArtifacts: true,
      });
    }
  });
}

test("missing authoritative Product specification uses the existing optional content error boundary", () => {
  assert.throws(
    () => selectPackageValidationArtifacts([record()], context("Exact Product", null)),
    /ownership could not be established/
  );
});

test("different historical revisions of one track are not filtered by current revision", () => {
  const history = [record(), record({ id: "older-artifact", revisionId: "older" })];
  assert.deepEqual(selectPackageValidationArtifacts(history, context()).artifacts, history);
});
