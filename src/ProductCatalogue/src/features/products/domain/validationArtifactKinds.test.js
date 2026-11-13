import assert from "node:assert/strict";
import test from "node:test";
import { partitionValidationArtifacts } from "./validationArtifactKinds.js";

test("separates explicit backend report kinds while preserving exact artifact identity", () => {
  const internal = { id: "internal", kind: "ValidationReport", revisionId: "r1" };
  const diagnostic = { id: "vld", kind: "ValidationDiagnostic", revisionId: "r2" };
  const icEnc = { id: "ic", kind: "IcEncReport", revisionId: "r3" };
  const unknown = { id: "unknown", kind: "Unexpected" };
  const missing = { id: "missing" };
  const result = partitionValidationArtifacts([internal, icEnc, diagnostic, unknown, missing]);
  assert.deepEqual(result.internalValidation, [internal, diagnostic]);
  assert.deepEqual(result.icEncReports, [icEnc]);
  assert.deepEqual(result.unknown, [unknown, missing]);
  assert.equal(result.icEncReports[0].revisionId, "r3");
});

test("untrusted filenames and incidental status words never authorize report provenance", () => {
  const result = partitionValidationArtifacts([
    { id: "forged", fileName: "IC-ENC Accepted.xml", kind: "ValidationReport" },
    { id: "unknown", fileName: "IC-ENC rejection.pdf" },
  ]);
  assert.deepEqual(result.icEncReports, []);
  assert.deepEqual(
    result.internalValidation.map((a) => a.id),
    ["forged"]
  );
  assert.deepEqual(
    result.unknown.map((a) => a.id),
    ["unknown"]
  );
});
