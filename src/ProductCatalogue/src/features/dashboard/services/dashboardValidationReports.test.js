import assert from "node:assert/strict";
import test from "node:test";
import { fetchDashboardValidationReports } from "./dashboardValidationReports.js";

const name = "Harbour primary";
const context = {
  datasetName: name,
  contentConfiguration: {
    internalValidation: { implemented: true, loaderId: "electronic-artifacts" },
  },
  data: { attributes: { productSpecification: 101 } },
};
const artifact = (id, overrides = {}) => ({
  id,
  trackId: `track-${id}`,
  datasetName: name,
  productSpecification: "S101",
  fileName: `${id}.xml`,
  url: `https://example.invalid/artifacts/${id}`,
  ...overrides,
});
function harness(products = [artifact("a"), artifact("b")], { resolution = null } = {}) {
  const calls = [];
  const params = {
    resolveProduct: async (value) => {
      calls.push(["resolve", value]);
      return resolution ?? { status: "resolved", product: context };
    },
    fetchArtifacts: async (value, options) => {
      calls.push(["artifacts", value, options.productContext]);
      return products;
    },
  };
  return { params, calls };
}

test("on-demand Dashboard validation returns all files with matching Product/specification ownership", async () => {
  const h = harness([
    artifact("a"),
    artifact("b"),
    artifact("foreign", { datasetName: "Other Product" }),
    artifact("wrong-spec", { productSpecification: "S57" }),
  ]);
  const result = await fetchDashboardValidationReports(name, h.params);
  assert.deepEqual(
    result.reports.map((report) => report.id),
    ["a", "b"]
  );
  assert.equal(result.hasUnattributedArtifacts, false);
  assert.deepEqual(
    h.calls.map(([type]) => type),
    ["resolve", "artifacts"]
  );
  assert.equal(h.calls[1][2], context);
});

test("unknown, unsupported and contradictory Product contexts fail closed without fetching artifacts", async () => {
  for (const resolution of [
    { status: "not-found", product: null },
    { status: "resolved", product: { ...context, datasetName: "Different" } },
    { status: "resolved", product: { ...context, contentConfiguration: null } },
  ]) {
    const h = harness([], { resolution });
    await assert.rejects(fetchDashboardValidationReports(name, h.params));
    assert.equal(h.calls.filter(([type]) => type === "artifacts").length, 0);
  }
});

test("conflicting artifact ownership never yields a download link", async () => {
  const h = harness([
    artifact("same", { trackId: "shared" }),
    artifact("other", { trackId: "shared", datasetName: "Another Product" }),
  ]);
  const result = await fetchDashboardValidationReports(name, h.params);
  assert.deepEqual(result.reports, []);
  assert.equal(result.hasUnattributedArtifacts, true);
});
