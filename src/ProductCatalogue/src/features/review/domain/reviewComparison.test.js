import assert from "node:assert/strict";
import test from "node:test";
import { serializeProductIdentity } from "../../dataSources/domain/productIdentity.js";
import {
  getReviewMetadataDifferences,
  getReviewSynchronizedScrollTop,
  projectReviewComparison,
} from "./reviewComparison.js";

function product(name, specification, { status = 8, edition = 3, sourceId = specification } = {}) {
  const productContext = {
    datasetName: name,
    sourceId,
    productKey: name,
    productType: "electronic-product",
    data: { attributes: { productSpecification: specification, status, edition } },
  };
  productContext.identityKey = serializeProductIdentity(productContext);
  return { datasetName: name, productContext, loadState: "loaded" };
}

function packageProduct(name, primary = {}, secondary = {}) {
  const members = [
    { ...product(`${name}-A`, "S101"), ...primary, memberKey: "a", productSpecification: "S101" },
    { ...product(`${name}-B`, "S57"), ...secondary, memberKey: "b", productSpecification: "S57" },
  ];
  return {
    datasetName: members[0].datasetName,
    productContext: members[0].productContext,
    loadState: "loaded",
    members,
    workUnit: {
      kind: "package",
      primaryMemberKey: "a",
      members: members.map((member) => ({
        key: member.memberKey,
        datasetName: member.datasetName,
        sourceId: member.productContext.sourceId,
      })),
    },
  };
}

const fieldsFor = (differences, member) => [...(differences.get(member.identity) ?? [])];

test("Package members compare only their own authoritative specification and metadata", () => {
  const a = projectReviewComparison(
    packageProduct("A", { status: 8, edition: 3 }, { status: 11, edition: 7 })
  );
  const b = projectReviewComparison(
    packageProduct("B", { status: 8, edition: 4 }, { status: 15, edition: 7 })
  );
  const differences = getReviewMetadataDifferences([a, b]);
  assert.deepEqual(fieldsFor(differences, a.members[0]), ["edition"]);
  assert.deepEqual(fieldsFor(differences, b.members[0]), ["edition"]);
  assert.deepEqual(fieldsFor(differences, a.members[1]), ["status"]);
  assert.deepEqual(fieldsFor(differences, b.members[1]), ["status"]);
  assert.equal(a.scrollGroup, b.scrollGroup);
  assert.equal(getReviewMetadataDifferences([a]).size, 0);
});

test("missing, unknown and differently scoped metadata never create a difference", () => {
  const a = projectReviewComparison(product("A", "S101", { status: 8, edition: 0 }));
  const b = projectReviewComparison(product("B", "S101", { status: "8", edition: "0" }));
  const c = projectReviewComparison(product("C", "S101", { status: 99, edition: "-" }));
  const d = projectReviewComparison(product("D", "S57", { status: 15, edition: 7 }));
  const e = projectReviewComparison(
    product("E", "S101", { status: 15, edition: 7, sourceId: "other-source" })
  );
  assert.equal(c.members[0].status, null);
  assert.equal(c.members[0].edition, null);
  assert.equal(getReviewMetadataDifferences([a, b, c, d, e]).size, 0);
  assert.notEqual(a.scrollGroup, d.scrollGroup);
  assert.notEqual(a.scrollGroup, e.scrollGroup);
});

test("all known differing values are marked without using the first Product as a reference", () => {
  const a = projectReviewComparison(product("A", "S101", { status: 8, edition: 0 }));
  const b = projectReviewComparison(product("B", "S101", { status: 8, edition: 2 }));
  const c = projectReviewComparison(product("C", "S101", { status: 8, edition: 2 }));
  const d = projectReviewComparison(product("D", "S101", { status: 8, edition: null }));
  const differences = getReviewMetadataDifferences([a, b, c, d]);
  for (const entry of [a, b, c]) {
    assert.deepEqual(fieldsFor(differences, entry.members[0]), ["edition"]);
  }
  assert.deepEqual(fieldsFor(differences, d.members[0]), []);
  assert.equal(getReviewMetadataDifferences([a, a]).size, 0);
  const conflictingA = projectReviewComparison(product("A", "S101", { status: 8, edition: 3 }));
  assert.equal(getReviewMetadataDifferences([a, conflictingA, b]).size, 0);
});

test("failed refresh, incomplete package, conflicting identity and pending payload fail closed", () => {
  const verified = packageProduct("A", { status: 8, edition: 3 });
  assert.ok(projectReviewComparison(verified));
  assert.equal(projectReviewComparison({ ...verified, refreshError: "Offline" }), null);
  assert.equal(projectReviewComparison({ ...verified, loadState: "loading" }), null);
  assert.equal(projectReviewComparison({ ...verified, resolutionFailed: true }), null);
  assert.equal(
    projectReviewComparison({ ...verified, members: verified.members.slice(0, 1) }),
    null
  );
  const invalid = product("Bad", "S101");
  invalid.productContext.productKey = " ";
  assert.equal(projectReviewComparison(invalid), null);
  assert.equal(
    projectReviewComparison({
      ...verified,
      members: [{ ...verified.members[0], productSpecification: "S57" }, verified.members[1]],
    }),
    null
  );
  assert.equal(
    projectReviewComparison({ ...verified, productContext: verified.members[1].productContext }),
    null
  );
});

test("a standalone Product and a Package share metadata peers but not outer scroll groups", () => {
  const a = projectReviewComparison(packageProduct("A", { status: 8, edition: 3 }));
  const b = projectReviewComparison(product("B", "S101", { status: 11, edition: 3 }));
  assert.notEqual(a.scrollGroup, b.scrollGroup);
  assert.deepEqual(fieldsFor(getReviewMetadataDifferences([a, b]), a.members[0]), ["status"]);
  assert.deepEqual(fieldsFor(getReviewMetadataDifferences([a, b]), a.members[1]), []);
});

test("scroll mapping follows the matching member and content section at different heights", () => {
  const source = [
    { key: "S101:History", top: 0, height: 200 },
    { key: "S101:Validation", top: 200, height: 100 },
    { key: "S57:History", top: 300, height: 150 },
  ];
  const target = [
    { key: "S101:History", top: 0, height: 300 },
    { key: "S101:Validation", top: 300, height: 50 },
    { key: "S57:History", top: 350, height: 300 },
  ];
  assert.equal(getReviewSynchronizedScrollTop(source, target, 100, 600), 150);
  assert.equal(getReviewSynchronizedScrollTop(source, target, 225, 600), 312.5);
  assert.equal(getReviewSynchronizedScrollTop(source, target, 375, 600), 500);
  assert.equal(getReviewSynchronizedScrollTop(source, target, 375, 420), 420);
  assert.equal(getReviewSynchronizedScrollTop(source, target.slice(0, 1), 225, 600), null);
  assert.equal(getReviewSynchronizedScrollTop([], target, 0, 600), null);
});
