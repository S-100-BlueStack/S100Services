import assert from "node:assert/strict";
import test from "node:test";
import { fetchProductHistory } from "./productHistoryApi.js";
import { createPackageHarness } from "../tests/packageHistoryTestSupport.js";
import { createCompatibilityWorkspaceProductContext } from "../../products/domain/productContext.js";
import { normalizeIcEncDeliveryHistory } from "../model/icEncDeliveryHistory.js";

const timestamp = "2026-11-26T09:00:00Z";
const dataset = "Exact name";
const deliveryId = "10000000-0000-4000-8000-000000000001";
const artifactId = "20000000-0000-4000-8000-000000000001";
const secondId = "20000000-0000-4000-8000-000000000002";

function report(id, url = `/electronicproducts/Exact%20name/artifacts/${id}`) {
  return {
    ArtifactId: id,
    FileName: "Same name.DOC",
    StoredAtUtc: timestamp,
    DownloadUrl: url,
    FromDecisionEmail: true,
  };
}

function section(reports) {
  return {
    DatasetName: dataset,
    ProductSpecification: "S101",
    Availability: "Available",
    HasMore: false,
    Items: [
      {
        DeliveryId: deliveryId,
        Edition: 2,
        Update: 0,
        ReservedAtUtc: timestamp,
        Decision: { Outcome: "Accepted", Source: "Manual" },
        ReportsAvailability: "Available",
        Reports: reports,
      },
    ],
  };
}

test("the opt-in retains legacy history and uses the specification from an exact electronic context", async () => {
  const h = createPackageHarness();
  const { product } = await h.workUnitService.resolveWorkUnit(h.names.s101);
  const calls = [];
  const get = async (url) => {
    calls.push(url);
    return {
      Data: [{ Name: h.names.s101, Status: 1 }],
      IcEncDeliveries: { ...section([]), DatasetName: h.names.s101 },
    };
  };

  const legacy = await fetchProductHistory(h.names.s101, { get });
  assert.equal(legacy.icEncDeliveries, undefined);
  const explicit = await fetchProductHistory(h.names.s101, {
    productContext: product,
    registry: h.registry,
    get,
  });
  assert.equal(explicit.icEncDeliveries, undefined);
  const compatibility = await fetchProductHistory(h.names.s101, {
    productContext: createCompatibilityWorkspaceProductContext(h.names.s101),
    registry: h.registry,
    includeIcEncDeliveries: true,
    get,
  });
  assert.equal(compatibility.icEncDeliveries, undefined);
  const ordinary = await fetchProductHistory(h.names.s101, {
    productContext: { ...product, workUnit: null },
    registry: h.registry,
    includeIcEncDeliveries: true,
    get,
  });
  assert.equal(ordinary.icEncDeliveries.availability, "Available");
  assert.deepEqual(ordinary.events, legacy.events);
  const base = `electronicproducts/${encodeURIComponent(h.names.s101)}/history`;
  assert.deepEqual(calls, [
    base,
    base,
    base,
    `${base}?includeIcEncDeliveries=true&specification=S101`,
  ]);
});

test("rejects off-origin, wrong owner, wrong ID and malformed paths while keeping exact duplicate filenames", () => {
  const payload = section([
    report(
      artifactId,
      `https://example.invalid/electronicproducts/Exact%20name/artifacts/${artifactId}`
    ),
    report(artifactId, `//electronicproducts/Exact%20name/artifacts/${artifactId}`),
    report(artifactId, `/different/electronicproducts/Exact%20name/artifacts/${artifactId}`),
    report(artifactId, `/electronicproducts/Sibling/artifacts/${artifactId}`),
    report(artifactId, `/electronicproducts/Exact%20name/artifacts/${secondId}`),
    report(artifactId, `/electronicproducts/Exact%XXname/artifacts/${artifactId}`),
    report(artifactId, `/electronicproducts/Exact%2Fname/artifacts/${artifactId}`),
    report(artifactId),
    report(secondId),
  ]);
  const result = normalizeIcEncDeliveryHistory(payload, dataset, "S101");
  const [item] = result.items;
  assert.equal(item.reportsAvailability, "Partial");
  assert.deepEqual(
    item.reports.map(({ id }) => id),
    [artifactId, secondId]
  );
  assert.ok(
    item.reports.every(
      ({ fileName, fromDecisionEmail }) => fileName === "Same name.DOC" && !fromDecisionEmail
    )
  );
  assert.deepEqual(item.decision, { outcome: "Accepted", source: "Manual", recordedAt: null });
});

test("validates section ownership and status and retains repeated attempts", () => {
  const payload = section([]);
  payload.Items.push({
    ...payload.Items[0],
    DeliveryId: secondId,
    Decision: null,
    TransportStatus: "NotDelivered",
  });
  const result = normalizeIcEncDeliveryHistory(payload, dataset, "S101");
  assert.deepEqual(
    result.items.map((item) => item.id),
    [deliveryId, secondId]
  );
  assert.equal(result.items[1].decision, null);
  assert.equal(normalizeIcEncDeliveryHistory(payload, dataset, "S57").availability, "Unavailable");
  assert.equal(
    normalizeIcEncDeliveryHistory(undefined, dataset, "S101").availability,
    "Unavailable"
  );
  payload.Items[1].TransportStatus = "Accepted";
  assert.equal(normalizeIcEncDeliveryHistory(payload, dataset, "S101").availability, "Unavailable");
});

test("an exact extension cannot render underneath a differently owned legacy timeline", async () => {
  const h = createPackageHarness();
  const { product } = await h.workUnitService.resolveWorkUnit(h.names.s101);
  const history = await fetchProductHistory(h.names.s101, {
    productContext: product,
    registry: h.registry,
    includeIcEncDeliveries: true,
    get: async () => ({
      Data: [{ Name: "Foreign timeline", Status: 1 }],
      IcEncDeliveries: { ...section([]), DatasetName: h.names.s101 },
    }),
  });
  assert.equal(history.datasetName, "Foreign timeline");
  assert.equal(history.icEncDeliveries.availability, "Unavailable");
  assert.deepEqual(history.icEncDeliveries.items, []);
});
