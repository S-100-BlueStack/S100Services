import assert from "node:assert/strict";
import test from "node:test";
import { normalizeArtifactHistory } from "./productArtifact.js";

const id = "11111111-1111-4111-8111-111111111111";
const artifact = {
  Id: id,
  TrackId: "track",
  RevisionId: "revision",
  DatasetName: "Exact Product",
  ProductSpecification: "S101",
  Kind: "InternalValidationReport",
  FileName: "diagnostic.xml",
  MediaType: "application/xml",
  Url: `/electronicproducts/Exact%20Product/artifacts/${id}`,
};

test("artifact history preserves backend Product, track, revision and owner URL metadata", () => {
  const [normalized] = normalizeArtifactHistory({ Data: [artifact] });
  assert.equal(normalized.datasetName, artifact.DatasetName);
  assert.equal(normalized.productSpecification, artifact.ProductSpecification);
  assert.equal(normalized.trackId, artifact.TrackId);
  assert.equal(normalized.revisionId, artifact.RevisionId);
  assert.ok(normalized.url.endsWith(artifact.Url));
  assert.equal(normalized.productSpecificationLabel, "S-101");
});

test("artifact normalization retains missing ownership rather than manufacturing it", () => {
  const [normalized] = normalizeArtifactHistory({ data: [{ id, url: artifact.Url }] });
  assert.equal(normalized.datasetName, undefined);
  assert.equal(normalized.productSpecification, undefined);
});

test("artifact history retains existing URL security and API-relative rebasing", () => {
  assert.deepEqual(
    normalizeArtifactHistory({
      Data: [{ ...artifact, Url: `https://evil.example${artifact.Url}` }],
    }),
    []
  );
  assert.deepEqual(
    normalizeArtifactHistory({ Data: [{ ...artifact, Url: "javascript:alert(1)" }] }),
    []
  );
  assert.equal(
    normalizeArtifactHistory({ Data: [{ ...artifact, Url: "/api" + artifact.Url }] })[0].url,
    normalizeArtifactHistory({ Data: [artifact] })[0].url
  );
});
