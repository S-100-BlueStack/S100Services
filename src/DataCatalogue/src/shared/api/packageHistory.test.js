import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogueService } from "./catalogueService.js";
import { createCatalogueClient } from "./catalogueClient.js";
import { normalizePackageHistoryPage } from "./packageHistory.js";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const PKG = "opaque package/id";
const event = (overrides = {}) => ({
  id: A,
  eventType: "severityUpdated",
  occurredAtUtc: "2026-01-15T10:00:00.1234567+00:00",
  actor: null,
  pipelineId: null,
  pipelineName: null,
  severity: "18446744073709551615",
  ...overrides,
});
const page = (items, nextBefore = null) => ({ packageId: PKG, items, nextBefore });

test("Package history uses the canonical encoded v1 route, credentials and continuation", async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const client = createCatalogueClient({
    baseUrl: "/api",
    credentials: "include",
    async fetchImpl(url, options) {
      calls.push({ url, options });
      return new Response(JSON.stringify(page([event()], A)), {
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  const service = createCatalogueService(client);
  const result = await service.packageHistory(PKG, { pageSize: 1, before: B, signal });
  assert.equal(
    calls[0].url,
    `/api/v1/packages/opaque%20package%2Fid/history?pageSize=1&before=${B}`
  );
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.signal, signal);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(result.items[0].severity, "18446744073709551615");
  assert.equal(result.nextBefore, A);
  await assert.rejects(service.packageHistory(PKG, { pageSize: 101 }), /pageSize/);
  await assert.rejects(service.packageHistory(PKG, { before: "invalid" }), /continuation/);
  assert.equal(calls.length, 1);
});

test("Package history accepts an explicit empty page but rejects invalid or mismatched responses", () => {
  assert.deepEqual(normalizePackageHistoryPage(page([]), PKG, 50), { items: [], nextBefore: null });
  for (const invalid of [
    null,
    {},
    { ...page([]), packageId: "other" },
    { packageId: PKG, items: [] },
    page([event(), event()]),
    page([event()], B),
    page([], A),
    page([event({ occurredAtUtc: "2026-01-15T10:00:00" })]),
    page([event({ eventType: "unknown" })]),
    page([event({ eventType: "pipelineAssigned", severity: null })]),
    page([event({ severity: "18446744073709551616" })]),
    page([event(), event({ id: B, occurredAtUtc: "2026-01-16T10:00:00Z" })]),
  ])
    assert.throws(() => normalizePackageHistoryPage(invalid, PKG, 2));
  assert.throws(() => normalizePackageHistoryPage(page([event()]), PKG, 50, A));
});

test("Binding history retains the backend pipeline identity without claiming Workspace context", () => {
  const result = normalizePackageHistoryPage(
    page([
      event({
        eventType: "pipelineUnassigned",
        severity: null,
        pipelineId: "pipeline-id",
        pipelineName: "ENC",
        actor: null,
      }),
    ]),
    PKG,
    50
  );
  assert.equal(result.items[0].pipelineId, "pipeline-id");
  assert.equal(result.items[0].pipelineName, "ENC");
  assert.equal(result.items[0].actor, null);
  assert.equal(result.items[0].workspaceId, undefined);
});

test("History normalization preserves recorded actor identities and does not invent missing ones", () => {
  for (const actor of ["PROD\\B123456", "System", null, undefined]) {
    const result = normalizePackageHistoryPage(page([event({ actor })]), PKG, 50);
    assert.equal(result.items[0].actor, actor ?? null);
  }
  assert.throws(() => normalizePackageHistoryPage(page([event({ actor: " " })]), PKG, 50));
});

test("Committed binding comments retain plain text, recorded actor and Workstream context", () => {
  const comment = event({
    eventType: "bindingCommentAdded",
    pipelineId: "enc",
    pipelineName: "ENC",
    severity: null,
    actor: "PROD\\B123456",
    commentText: "First line\n<img src=x onerror=alert(1)>",
  });
  const history = normalizePackageHistoryPage(page([comment]), PKG, 50);
  assert.equal(history.items[0].commentText, comment.commentText);
  assert.equal(history.items[0].actor, comment.actor);
  assert.equal(history.items[0].pipelineId, comment.pipelineId);
  for (const invalid of [
    { ...comment, commentText: null },
    { ...comment, pipelineId: null },
    { ...comment, actor: null },
    event({ commentText: "not a binding comment" }),
  ]) {
    assert.throws(() => normalizePackageHistoryPage(page([invalid]), PKG, 50));
  }
});
