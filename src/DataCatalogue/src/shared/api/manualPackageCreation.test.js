import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogueClient, parseExactJson } from "./catalogueClient.js";
import { createCatalogueService } from "./catalogueService.js";
import { createManualPackageService } from "./manualPackageCreation.js";
import { createPackageCreationSession } from "../../features/packageCreator/createPackageCreationSession.js";
import { createPackageRequest } from "../../features/packageCreator/createPackageRequest.js";
import { createPackageGeometrySource } from "../../features/map/packages/createPackageGeometrySource.js";
import { createPackageGeometryOverlay } from "../../features/map/packages/createPackageGeometryOverlay.js";

const id = "0123456789abcdefgh";
const aoi = {
  rings: [
    [
      [12, 55],
      [12, 56],
      [13, 56],
      [13, 55],
      [12, 55],
    ],
  ],
  spatialReference: { wkid: 4326 },
};
const request = {
  category: "WorkZone",
  absoluteUri: "urn:example:source",
  esriJSON: JSON.stringify(aoi),
  metaData: { refId: 'case "42"', title: 'Line 1\n"},"severity":0' },
};
const item = {
  id,
  category: "WorkZone",
  absoluteUri: "example:source",
  metaData: { shortId: "WZ-001-26", refId: 'case "42"' },
  hasPipeline: true,
  assignmentStatus: "assigned",
  pipelineBindings: [{ id: `${id}::S101`, pipelineId: "S101" }],
};

function response(status, body, headers = {}) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function fixture(reply, options = {}) {
  const calls = [];
  const client = createCatalogueClient({
    baseUrl: "https://example.invalid/api",
    credentials: "include",
    fetchImpl(url, init) {
      calls.push({ url, ...init });
      return reply(calls.at(-1));
    },
  });
  const catalogue = createCatalogueService(client);
  return {
    service: createManualPackageService({ client, catalogue, ...options }),
    catalogue,
    calls,
  };
}

for (const [priority, severity, expected] of [
  ["", undefined, "18446744073709551615"],
  ["custom", "18446744073709551615", "18446744073709551615"],
  ["custom", "9007199254740993", "9007199254740993"],
  ["highest", "0", "0"],
]) {
  test(`creation confirms HTTP 201 and round-trips exact Severity ${severity ?? "(omitted)"}`, async () => {
    const { service, calls } = fixture(() =>
      response(201, `{"severity":${expected},${JSON.stringify(item).slice(1)}`)
    );
    const payload = createPackageRequest(
      {
        category: request.category,
        absoluteUri: request.absoluteUri,
        ...request.metaData,
        priority,
        ...(priority === "custom" ? { severity } : {}),
      },
      [{ id: request.category }],
      aoi
    );
    const result = await service.create(payload);
    assert.equal(result.status, "confirmed");
    assert.equal(result.item.severity, expected);
    assert.deepEqual(result.item.pipelineIds, ["S101"]);
    assert.equal(result.item.sourceReadback, "example:source");
    assert.equal(calls.length, 1);
    const [{ url, method, credentials, redirect, headers, body }] = calls;
    assert.equal(url, "https://example.invalid/api/v1/packages");
    assert.equal(method, "POST");
    assert.equal(credentials, "include");
    assert.equal(redirect, "error");
    assert.equal(headers["Content-Type"], "application/json");
    if (severity !== undefined) assert.ok(body.endsWith(`,"severity":${severity}}`));
    const expectedRequest =
      severity === undefined ? request : { ...request, severity: severity === "0" ? 0 : severity };
    assert.deepEqual(parseExactJson(body), expectedRequest);
    assert.deepEqual(parseExactJson(body).metaData, request.metaData);
    assert.deepEqual(JSON.parse(JSON.parse(body).esriJSON), aoi);
  });
}

test("explicit rejections expose status and safe ProblemDetails for the draft", async () => {
  for (const status of [400, 401, 403, 404, 409]) {
    const { service, calls } = fixture(() =>
      response(status, JSON.stringify({ title: "Problem", detail: String(status) }))
    );
    assert.deepEqual(await service.create(request), {
      status: "rejected",
      message: `Problem ${status}`,
    });
    assert.equal(calls.length, 1);
  }
});

test("5xx, network errors, non-201 and mismatched receipt are never confirmed or retried", async () => {
  const body = JSON.stringify({ ...item, severity: 0 });
  for (const reply of [
    () => response(500, body),
    () => {
      throw new TypeError("connection lost");
    },
    () => response(200, body),
    () => response(201, body, { Location: "/api/v1/packages/999999999999999999" }),
    () => response(201, body.replace("WorkZone", "Other")),
  ]) {
    const { service, calls } = fixture(reply);
    assert.equal((await service.create({ ...request, severity: "0" })).status, "unknown");
    assert.equal(calls.length, 1);
  }
});

test("conflicting valid 201 identities cannot be reconciled or trigger another POST", async () => {
  const locationId = "999999999999999999";
  // Even a partial receipt identifies a different candidate when its ID is valid.
  for (const receipt of [
    { ...item, severity: 0 },
    { id },
    { ...item, category: "Other", severity: 0 },
  ]) {
    const { service, calls } = fixture(({ method, url }) => {
      if (method === "POST") {
        return response(201, JSON.stringify(receipt), {
          Location: `/api/v1/packages/${locationId}`,
        });
      }
      // A direct read could confirm a plausible but unrelated Package at either ID.
      return response(200, JSON.stringify({ ...item, id: url.split("/").at(-1), severity: 0 }));
    });
    const session = createPackageCreationSession({
      service,
      onCatalogueChange() {},
      onState() {},
    });
    const exact = { ...request, severity: "0" };

    await session.submit(exact);
    const unknown = session.snapshot();
    assert.equal(unknown.status, "unknown");
    await session.reconcile();
    await session.submit(exact);
    assert.equal(session.snapshot(), unknown);
    assert.equal(unknown.knownId, null);
    assert.match(unknown.message, /conflicting Package identities/);
    assert.deepEqual(
      calls.map(({ method }) => method),
      ["POST"]
    );
    session.destroy();
  }
});

test("partial 201 retains ID and reconciliation uses a direct GET only", async () => {
  for (const [body, headers] of [
    ["{", { Location: `/api/v1/packages/${id}` }],
    [JSON.stringify({ ...item, pipelineBindings: null, severity: 0 }), {}],
  ]) {
    const { service, calls } = fixture(({ method, url }) => {
      if (method === "POST") return response(201, body, headers);
      assert.equal(url, `https://example.invalid/api/v1/packages/${id}`);
      return response(200, JSON.stringify({ ...item, severity: 0 }));
    });
    const exact = { ...request, severity: "0" };
    const unknown = await service.create(exact);
    assert.equal(unknown.status, "unknown");
    assert.equal(unknown.knownId, id);
    assert.equal((await service.reconcile(id, exact)).sourceReadback, "example:source");
    assert.deepEqual(
      calls.map(({ method }) => method),
      ["POST", "GET"]
    );
  }
});

test("request deadline aborts the client without assigning a definitive failure", async () => {
  const { service, calls } = fixture(
    ({ signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    { timeoutMs: 5 }
  );
  // Keep Node alive while its unref'ed AbortSignal timeout elapses.
  const hold = setTimeout(() => {}, 1000);
  try {
    assert.deepEqual(await service.create(request), {
      status: "unknown",
      knownId: null,
      message: "The request timed out.",
    });
    assert.equal(calls.length, 1);
  } finally {
    clearTimeout(hold);
  }
});

test("stored AOI read is scoped to canonical ID; failed preview retries only GET", async () => {
  let reads = 0;
  const { service, catalogue, calls } = fixture(({ method, url }) => {
    if (method === "POST") return response(201, JSON.stringify({ ...item, severity: 0 }));
    assert.equal(url, `https://example.invalid/api/v1/packages/${id}/geometry`);
    if (++reads === 1) return response(500, "{}");
    return response(200, JSON.stringify({ aoi, detailedGeometry: null }));
  });
  const overlay = createPackageGeometryOverlay({
    source: createPackageGeometrySource({ catalogue }),
    renderer: {
      prepare(geometry) {
        assert.deepEqual(geometry.aoi, aoi);
        return { graphics: ["stored"], detailCount: 0 };
      },
      replace() {},
      stop() {},
      clear() {},
      destroy() {},
    },
  });
  const result = await service.create({ ...request, severity: "0" });
  assert.equal(result.status, "confirmed");
  assert.equal((await overlay.setPackage(result.item.id)).status, "error");
  assert.equal((await overlay.setPackage(result.item.id, { reload: true })).status, "ready");
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["POST", "GET", "GET"]
  );
  overlay.destroy();
});
