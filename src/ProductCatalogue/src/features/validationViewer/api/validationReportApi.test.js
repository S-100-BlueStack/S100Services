import assert from "node:assert/strict";
import test from "node:test";
import { getValidationViewerArtifact } from "../domain/validationViewerArtifact.js";
import { fetchValidationReportBytes } from "./validationReportApi.js";

const id = "12345678-1234-1234-1234-123456789abc";
const artifact = {
  id,
  fileName: "Harbour.vld",
  datasetName: "Harbour east",
  kind: "ValidationDiagnostic",
  url: `/electronicproducts/Harbour%20east/artifacts/${id}`,
  revisionId: "old-revision",
};

test("only exact authorized artifact identity and configured API routes are eligible", () => {
  const valid = getValidationViewerArtifact(artifact, "HARBOUR EAST");
  assert.equal(valid.url, artifact.url);
  assert.equal(valid.revisionId, "old-revision");
  for (const invalid of [
    { fileName: "Harbour.zip" }, { kind: "IcEncReport" }, { kind: "Unknown" }, { id: "another" },
    { url: `https://example.invalid${artifact.url}` }, { url: `${artifact.url}?other=1` },
    { url: artifact.url.replace("Harbour%20east", "..") }, { url: artifact.url.replace("Harbour%20east", "Harbour%2Feast") },
    { datasetName: "Another Product" },
  ]) assert.equal(getValidationViewerArtifact({ ...artifact, ...invalid }), null);
  assert.equal(getValidationViewerArtifact(artifact, "OTHER"), null);
});

test("requests original artifact bytes with authentication and no redirect", async () => {
  let options;
  const bytes = Uint8Array.from([0x61, 0xff, 0x62]);
  const result = await fetchValidationReportBytes(artifact, { request: async (url, init) => {
    assert.equal(url, artifact.url);
    options = init;
    return new Response(bytes, { headers: { "content-type": "text/plain" } });
  }});
  assert.deepEqual(result, bytes);
  assert.equal(options.credentials, "include");
  assert.equal(options.redirect, "error");
});

test("rejects permission failure, login page, empty file and oversized response", async () => {
  for (const [response, message] of [
    [new Response("Forbidden", { status: 403 }), /HTTP 403/],
    [new Response("<html>Login</html>", { headers: { "content-type": "text/html" } }), /supported validation file/],
    [new Response(""), /empty/],
    [new Response("123456789", { headers: { "content-length": "9" } }), /too large/],
    [new Response("123456789"), /too large/],
  ]) await assert.rejects(fetchValidationReportBytes(artifact, { request: async () => response, maxBytes: 8 }), message);
});

test("cancellation and invalid artifact fail before any network request", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const request = async () => { calls++; return new Response("test"); };
  await assert.rejects(fetchValidationReportBytes(artifact, { request, signal: controller.signal }));
  await assert.rejects(fetchValidationReportBytes({ ...artifact, id: "wrong" }, { request }), /verified/);
  assert.equal(calls, 0);
});
