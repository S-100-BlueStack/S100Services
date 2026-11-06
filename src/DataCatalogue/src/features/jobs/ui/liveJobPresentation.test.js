import assert from "node:assert/strict";
import test from "node:test";
import { getLiveJobPresentation } from "./liveJobPresentation.js";

test("Live Jobs use shortId and keep their Pipeline and Workspace contexts distinct", () => {
  const a = getLiveJobPresentation({
    source: "live",
    id: '["pkg","enc","east"]',
    packageId: "internal-pkg-id",
    shortId: "NM1000",
    packageTitle: "Harbour notice",
    pipelineName: "ENC",
    workspaceName: "Eastern Denmark",
  });
  const b = getLiveJobPresentation({
    source: "live",
    packageId: "internal-pkg-id",
    shortId: "NM1000",
    packageTitle: "Harbour notice",
    pipelineName: "Paper Charts",
    workspaceName: "Eastern Denmark",
  });
  assert.deepEqual(a, {
    shortId: "NM1000",
    packageTitle: "Harbour notice",
    context: "ENC / Eastern Denmark",
    pipeline: "ENC",
  });
  assert.equal(b.shortId, a.shortId);
  assert.equal(b.context, "Paper Charts / Eastern Denmark");
  assert.ok(!Object.values(a).some((value) => value.includes("internal-pkg-id")));
});

test("Live Job presentation handles optional metadata without displaying composite IDs", () => {
  assert.deepEqual(
    getLiveJobPresentation({
      source: "live",
      packageId: "opaque-pkg-id",
      packageTitle: "opaque-pkg-id",
    }),
    { shortId: "opaque-pkg-id", packageTitle: "", context: "", pipeline: "" }
  );
  assert.equal(getLiveJobPresentation({ source: "mock", id: "mock-job" }), null);
  assert.equal(getLiveJobPresentation(null), null);
});
