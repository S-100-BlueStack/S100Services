import assert from "node:assert/strict";
import test from "node:test";
import { fetchAnalyzeProducts } from "./analyzeApi.js";
import { normalizeArtifactHistory } from "../../data/normalizers/productArtifact.js";
import { artifactHarness, memberNames, validationArtifact } from "./analyzeArtifactTestSupport.js";

for (const alias of memberNames) {
  test(`combined validation history belongs only to its exact package Product via ${alias}`, async (t) => {
    const h = artifactHarness();
    const [product] = await fetchAnalyzeProducts([alias], h);
    assert.equal(product.workspaceLoadState, "loaded");
    assert.deepEqual(
      product.members.map((member) => member.datasetName),
      memberNames
    );
    const ids = product.members.map((member) =>
      member.internalValidationReports.map((report) => report.id)
    );
    t.diagnostic(JSON.stringify({ alias, memberReportIds: ids }));
    assert.deepEqual(ids, [[validationArtifact(0).Id], [validationArtifact(1).Id]]);
    assert.equal(h.calls.filter((path) => path.endsWith("/artifacts/history")).length, 2);
    const normalized = normalizeArtifactHistory(h.state.response);
    for (const [index, member] of product.members.entries()) {
      assert.equal(member.internalValidationReports[0].url, normalized[index].url);
      assert.equal(member.internalValidationReports[0].raw.trackId, normalized[index].trackId);
      assert.equal(
        member.internalValidationReports[0].raw.revisionId,
        normalized[index].revisionId
      );
    }
  });
}

test("historical revisions stay with their Product and empty members do not inherit reports", async () => {
  const old = validationArtifact(0, {
    Id: "33333333-3333-4333-8333-333333333333",
    RevisionId: "66666666-6666-4666-8666-666666666666",
    Url: `/electronicproducts/${encodeURIComponent(memberNames[0])}/artifacts/33333333-3333-4333-8333-333333333333`,
  });
  const [product] = await fetchAnalyzeProducts(
    memberNames,
    artifactHarness({ response: { Data: [old, validationArtifact(0)] } })
  );
  assert.deepEqual(
    product.members[0].internalValidationReports.map((report) => report.id),
    [old.Id, validationArtifact(0).Id]
  );
  assert.deepEqual(product.members[1].internalValidationReports, []);
});

for (const record of [
  validationArtifact(0, { DatasetName: "Different harbour" }),
  validationArtifact(0, { ProductSpecification: "S57" }),
  validationArtifact(0, { DatasetName: null }),
  validationArtifact(0, { ProductSpecification: null }),
  validationArtifact(0, { ProductSpecification: "Unknown" }),
]) {
  test(`invalid or foreign validation ownership is not guessed: ${JSON.stringify([record.DatasetName, record.ProductSpecification])}`, async () => {
    const [product] = await fetchAnalyzeProducts(
      memberNames,
      artifactHarness({ response: { Data: [record] } })
    );
    assert.equal(product.workspaceLoadState, "loaded");
    assert.ok(product.members.every((member) => member.internalValidationReports.length === 0));
    assert.ok(product.members.every((member) => member.status != null));
  });
}

test("one member artifact failure preserves the other's correctly scoped content", async () => {
  const h = artifactHarness();
  h.state.failMember = memberNames[1];
  const [product] = await fetchAnalyzeProducts(memberNames, h);
  assert.equal(product.workspaceLoadState, "loaded");
  assert.deepEqual(
    product.members[0].internalValidationReports.map((report) => report.id),
    [validationArtifact(0).Id]
  );
  assert.deepEqual(product.members[1].internalValidationReports, []);
  assert.equal(product.members[1].loadError, "Validation artifacts unavailable");
  assert.equal(product.members[1].status, 11);
});

test("ordinary electronic Analyze retains its unfiltered artifact history contract", async () => {
  const h = artifactHarness();
  const resolution = await h.productService.resolveProduct(memberNames[0]);
  const [product] = await fetchAnalyzeProducts([memberNames[0]], {
    ...h,
    resolutions: [{ ...resolution, workUnit: null, requestedDatasetName: memberNames[0] }],
  });
  assert.equal(product.members, undefined);
  assert.deepEqual(
    product.internalValidationReports.map((report) => report.id),
    [validationArtifact(0).Id, validationArtifact(1).Id]
  );
});

test("unattributable optional artifacts warn without discarding valid member content", async () => {
  const h = artifactHarness({
    response: {
      Data: [validationArtifact(0), validationArtifact(1, { ProductSpecification: null })],
    },
  });
  const [product] = await fetchAnalyzeProducts(memberNames, h);
  assert.equal(product.workspaceLoadState, "loaded");
  assert.deepEqual(
    product.members[0].internalValidationReports.map((report) => report.id),
    [validationArtifact(0).Id]
  );
  assert.deepEqual(product.members[1].internalValidationReports, []);
  assert.ok(product.members.every((member) => /ownership/.test(member.loadError)));
});

test("artifact errors leave exact member metadata and independently loaded History available", async () => {
  const h = artifactHarness();
  h.state.failMember = memberNames[0];
  const products = await fetchAnalyzeProducts(memberNames, h);
  const { loadAnalyzeProductHistories } = await import("../services/analyzeHistoryLoader.js");
  const [product] = await loadAnalyzeProductHistories(products, {
    fetchHistory: async (datasetName) => ({
      endpointAvailable: true,
      events: [{ id: datasetName }],
    }),
  });
  assert.equal(product.workspaceLoadState, "loaded");
  assert.deepEqual(
    product.members.map((member) => member.edition),
    [1, 1]
  );
  assert.deepEqual(
    product.members.map((member) => member.history.events[0].id),
    memberNames
  );
  assert.equal(product.members[0].loadError, "Validation artifacts unavailable");
  assert.deepEqual(
    product.members[1].internalValidationReports.map((report) => report.id),
    [validationArtifact(1).Id]
  );
});
