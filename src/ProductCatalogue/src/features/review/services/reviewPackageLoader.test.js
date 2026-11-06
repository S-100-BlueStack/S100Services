import assert from "node:assert/strict";
import test from "node:test";
import { loadReviewHistories } from "./reviewHistoryLoader.js";
import { resolveReviewComposition } from "./reviewWorkUnitResolver.js";
import { reconcileWorkspaceResolutions } from "../../products/domain/workspaceResolutionClaims.js";
import { getReviewWorkUnitSignature } from "../domain/reviewWorkUnits.js";
import {
  getReviewHistoryPresentation,
  getReviewIcEncPresentation,
  getReviewValidationPresentation,
} from "../ui/reviewContentPresentation.js";
import {
  createReviewPackageFixture,
  packageNames,
  deferred,
  waitForReview,
} from "../testSupport/reviewPackageFixture.js";

for (const names of [
  packageNames,
  [...packageNames].reverse(),
  [packageNames[1], packageNames[0], packageNames[1]],
]) {
  test(`Review resolves aliases once with complete ordered members: ${JSON.stringify(names)}`, async () => {
    const h = createReviewPackageFixture();
    const composition = await resolveReviewComposition(names, h.options);
    assert.deepEqual(
      composition.items.map((item) => item.datasetName),
      [packageNames[0]]
    );
    assert.equal(h.calls.exact.length, 2);
    assert.deepEqual(
      h.calls.exact,
      names[0] === packageNames[0] ? packageNames : [...packageNames].reverse()
    );
    const exactBefore = h.calls.exact.length;
    const [product] = await loadReviewHistories([packageNames[0]], {
      ...h.options,
      resolutions: composition.resolutions,
    });
    assert.equal(h.calls.exact.length, exactBefore);
    assert.equal(product.loadState, "loaded", product.error);
    assert.equal(product.workUnitSignature, getReviewWorkUnitSignature(composition.resolutions[0]));
    assert.deepEqual(
      product.members.map((member) => [
        member.datasetName,
        member.sourceId,
        member.memberLabel,
        member.status,
        member.edition,
        member.update,
      ]),
      [
        [packageNames[0], "s101", "S-101", 8, 3, 2],
        [packageNames[1], "s57", "S-57", 11, 7, 4],
      ]
    );
    assert.deepEqual(h.calls.history, packageNames);
    assert.deepEqual(h.calls.artifacts, packageNames);
    assert.equal(product.members[0].validationArtifacts.length, 2);
    assert.equal(product.members[1].validationArtifacts.length, 1);
    for (const [index, member] of product.members.entries()) {
      assert.ok(
        member.validationArtifacts.every(
          (artifact) =>
            artifact.datasetName === packageNames[index] &&
            artifact.productSpecification === (index ? "S57" : "S101")
        )
      );
      assert.ok(
        member.validationArtifacts.every((artifact) =>
          artifact.url.includes(`${encodeURIComponent(packageNames[index])}/artifacts/`)
        )
      );
      assert.match(member.artifactWarning, /ambiguous or missing/);
      assert.equal(getReviewHistoryPresentation(member).state, "empty");
      assert.equal(getReviewValidationPresentation(member).state, "content");
      assert.equal(getReviewIcEncPresentation(member).state, "unavailable");
    }
    assert.equal(product.members[0].validationArtifacts[1].revisionId, "historical");
  });
}

test("exact F6A Product resolution remains S-57 while Review owns the S-101 work unit", async () => {
  const h = createReviewPackageFixture();
  const exact = await h.options.workspaceProductService.resolveProduct(packageNames[1]);
  assert.equal(exact.product.datasetName, packageNames[1]);
  const [review] = await loadReviewHistories([packageNames[1]], h.options);
  assert.equal(review.datasetName, packageNames[0]);
  assert.equal(review.members[1].productContext.datasetName, exact.product.datasetName);
});

test("later complete proof reconciles an earlier failed alias in first-occurrence order", async () => {
  const h = createReviewPackageFixture();
  const service = h.options.workspaceWorkUnitService;
  let first = true;
  const composition = await resolveReviewComposition(
    ["Simple A", packageNames[1], "Simple B", packageNames[0]],
    {
      ...h.options,
      workspaceWorkUnitService: {
        resolveWorkUnit: (name) => {
          if (name === packageNames[1] && first) {
            first = false;
            return { status: "failed", requestedDatasetName: name, error: "Early failure" };
          }
          return service.resolveWorkUnit(name);
        },
      },
    }
  );
  assert.deepEqual(
    composition.items.map((item) => item.datasetName),
    ["Simple A", packageNames[0], "Simple B"]
  );
  assert.equal(composition.resolutions[1].status, "resolved");
});

test("consistent complete claims deduplicate and conflicting complete claims fail closed", async () => {
  const h = createReviewPackageFixture();
  const proof = await h.options.workspaceWorkUnitService.resolveWorkUnit(packageNames[0]);
  const alias = { ...proof, requestedDatasetName: packageNames[1] };
  assert.equal(reconcileWorkspaceResolutions([alias, proof], { surface: "Review" }).length, 1);
  const conflict = {
    ...proof,
    requestedDatasetName: packageNames[1],
    product: { ...proof.product, datasetName: "Conflicting owner" },
    workUnit: { ...proof.workUnit, identityKey: "different" },
  };
  const [failed] = reconcileWorkspaceResolutions([alias, conflict], { surface: "Review" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.product, null);
  assert.match(failed.error, /Conflicting Review/);
});

for (const field of ["failExact", "missing", "remapped"]) {
  test(`structural member failure cannot publish a half-package: ${field}`, async () => {
    const h = createReviewPackageFixture();
    h.controls[field] = field === "remapped" ? true : packageNames[1];
    const [product] = await loadReviewHistories([packageNames[0]], h.options);
    assert.equal(product.loadState, "failed");
    assert.equal(product.resolutionFailed, true);
    assert.equal(product.members, undefined);
  });
}

for (const field of ["failHistory", "failArtifacts"]) {
  test(`optional member failure stays independent: ${field}`, async () => {
    const h = createReviewPackageFixture();
    h.controls[field] = packageNames[1];
    const [product] = await loadReviewHistories(packageNames, h.options);
    assert.equal(product.loadState, "loaded", product.error);
    assert.equal(product.members.length, 2);
    assert.equal(getReviewValidationPresentation(product.members[0]).state, "content");
    assert.equal(getReviewHistoryPresentation(product.members[0]).state, "empty");
    assert.equal(
      getReviewValidationPresentation(product.members[1]).state,
      field === "failArtifacts" ? "failed" : "content"
    );
    assert.equal(
      getReviewHistoryPresentation(product.members[1]).state,
      field === "failHistory" ? "failed" : "empty"
    );
  });
}

test("post-prime metadata contradicting the proof fails before optional member reads publish", async () => {
  const h = createReviewPackageFixture();
  const { resolutions } = await resolveReviewComposition(packageNames, h.options);
  h.controls.remapped = true;
  const [product] = await loadReviewHistories(packageNames, { ...h.options, resolutions });
  assert.equal(product.resolutionFailed, true);
  assert.equal(product.members, undefined);
});

test("source replacement during member reads rejects the complete payload", async () => {
  const h = createReviewPackageFixture();
  const { resolutions } = await resolveReviewComposition(packageNames, h.options);
  const gate = deferred();
  h.controls.artifactGate = gate;
  const pending = loadReviewHistories(packageNames, { ...h.options, resolutions });
  await waitForReview(() => h.calls.artifacts.length >= 2);
  h.registry.byId.set("s57", { ...h.registry.byId.get("s57") });
  gate.resolve();
  const [product] = await pending;
  assert.equal(product.resolutionFailed, true);
  assert.equal(product.members, undefined);
});

test("same combined response omits conflicting owner claims from both members", async () => {
  const h = createReviewPackageFixture();
  h.records[1].TrackId = h.records[0].TrackId;
  const [product] = await loadReviewHistories(packageNames, h.options);
  assert.ok(product.members.every((member) => member.validationArtifacts.length === 0));
  assert.ok(product.members.every((member) => member.artifactWarning));
});

test("backend mapping changed during optional content reads rejects the complete package", async () => {
  const h = createReviewPackageFixture();
  const { resolutions } = await resolveReviewComposition(packageNames, h.options);
  const gate = deferred();
  h.controls.artifactGate = gate;
  const pending = loadReviewHistories(packageNames, { ...h.options, resolutions });
  await waitForReview(() => h.calls.artifacts.length >= 2);
  h.controls.remapped = true;
  gate.resolve();
  const [product] = await pending;
  assert.equal(product.resolutionFailed, true);
  assert.equal(product.members, undefined);
});
