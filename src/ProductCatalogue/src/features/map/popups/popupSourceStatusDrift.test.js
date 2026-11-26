import assert from "node:assert/strict";
import test from "node:test";
import { normalizeElectronicProductResponse } from "../../data/normalizers/productResponse.js";
import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { normalizeDataSourcePayload } from "../../dataSources/services/dataSourceNormalizer.js";
import { createLiveEncAoi } from "../../dataSources/tests/fixtures/liveEncAoi.js";
import { detectPackagePopupStatusDrift } from "./popupSourceStatusDrift.js";

const source = createDataSourceRegistry().byId.get("s101");
const datasetName = "101DK0041149E";
const productContext = { sourceId: source.id, datasetName, workUnit: source.workUnit };
const refresh = { sourceId: source.id, datasetName };

function compare(updateDetail = () => {}, updateAoi = () => {}, context = productContext) {
  const aoi = createLiveEncAoi({ workflowStatus: 15, s101Status: 11 });
  const detail = {
    Name: datasetName.toLowerCase(),
    Status: 15,
    ErrorMessage: "Compatibility message",
    S101: { Name: datasetName, Status: 5 },
    S57: { Name: aoi.Attributes.Package.S57.DatasetName, Status: 5 },
    Package: structuredClone(aoi.Attributes.Package),
  };
  updateDetail(detail);
  updateAoi(aoi.Attributes);
  const [attributes] = normalizeDataSourcePayload([aoi], source).products;
  const snapshot = structuredClone(attributes);
  const result = detectPackagePopupStatusDrift({
    productContext: context,
    attributes,
    detail: normalizeElectronicProductResponse(detail),
  });
  assert.deepEqual(attributes, snapshot);
  return result;
}

test("an equal mixed snapshot ignores compatibility status and published Product metadata", () => {
  assert.equal(
    compare((detail) => {
      detail.Status = 1;
      detail.Package.Status = "error";
      detail.Package.S101.Status = "11";
      detail.Package.S57.Status = "15";
      detail.Package.S57.DatasetName = detail.Package.S57.DatasetName.toLowerCase();
    }),
    null
  );
});

for (const [change, update] of [
  ["aggregate only", (pkg) => (pkg.Status = "2")],
  ["S-101 only", (pkg) => (pkg.S101.Status = 10)],
  ["S-57 only", (pkg) => (pkg.S57.Status = 1)],
  ["aggregate diagnostic only", (pkg) => (pkg.ErrorMessage = "Updated aggregate diagnostic")],
  ["member diagnostic only", (pkg) => (pkg.S57.ErrorMessage = "Updated member diagnostic")],
  ["explicitly cleared member diagnostic", (pkg) => (pkg.S57.ErrorMessage = null)],
  ["restored member diagnostic", (pkg) => (pkg.S101.ErrorMessage = "Delivery uncertainty")],
]) {
  test(`a comparable ${change} requests source revalidation`, () => {
    assert.deepEqual(
      compare((detail) => update(detail.Package)),
      refresh
    );
  });
}

for (const [change, update] of [
  ["omitted members", (detail) => delete detail.Package.S101],
  ["omitted package", (detail) => delete detail.Package],
  ["wrong root Product", (detail) => (detail.Name = "OTHER")],
  ["omitted source dataset", (detail) => delete detail.Package.SourceDatasetName],
  ["wrong source dataset", (detail) => (detail.Package.SourceDatasetName = "OTHER")],
  ["contradictory member", (detail) => (detail.Package.S57.DatasetName = "OTHER")],
  ["contradictory published identity", (detail) => (detail.S57.Name = "OTHER")],
  ["contradictory specification", (detail) => (detail.Package.S57.ProductSpecification = 1)],
]) {
  test(`${change} makes the detail insufficient evidence even when aggregate changes`, () => {
    assert.equal(
      compare((detail) => {
        detail.Package.Status = 2;
        update(detail);
      }),
      null
    );
  });
}

test("unknown states and absent or invalid diagnostics do not manufacture drift", () => {
  assert.equal(
    compare((detail) => {
      detail.Package.Status = 999;
      detail.Package.S101.Status = 999;
      detail.Package.S57.Status = "Error"; // Product status accepts only known numeric IDs.
      delete detail.Package.S57.ErrorMessage;
    }),
    null
  );
  assert.equal(
    compare((detail) => delete detail.Package.S57.ErrorMessage),
    null
  );
  assert.equal(
    compare((detail) => (detail.Package.S57.ErrorMessage = false)),
    null
  );
  assert.equal(
    compare(
      (detail) => (detail.Package.S57.ErrorMessage = null),
      (aoi) => delete aoi.Package.S57.ErrorMessage
    ),
    null
  );
  assert.equal(
    compare(
      (detail) => (detail.Package.S57.ErrorMessage = "New error"),
      (aoi) => delete aoi.Package.S57.ErrorMessage
    ),
    null
  );
  assert.deepEqual(
    compare(
      (detail) => (detail.Package.S57.ErrorMessage = "New error"),
      (aoi) => (aoi.Package.S57.ErrorMessage = null)
    ),
    refresh
  );
});

test("incomplete AOI member identity or a different source cannot borrow the detail observation", () => {
  const changed = (detail) => (detail.Package.Status = 2);
  assert.equal(
    compare(changed, (aoi) => delete aoi.Package.S57),
    null
  );
  assert.equal(
    compare(changed, () => {}, { ...productContext, sourceId: "s57" }),
    null
  );
  assert.equal(
    compare(changed, () => {}, { ...productContext, workUnit: null }),
    null
  );
});
