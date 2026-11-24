import assert from "node:assert/strict";
import test from "node:test";
import { serializeProductIdentity } from "../../dataSources/domain/productIdentity.js";
import { getReviewSynchronizedScrollTop, projectReviewComparison } from "./reviewComparison.js";

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

test("Packages synchronize only matching ordered source and specification layouts", () => {
  const a = projectReviewComparison(packageProduct("A"));
  const b = projectReviewComparison(packageProduct("B"));
  assert.equal(a.scrollGroup, b.scrollGroup);
  assert.notEqual(a.members[0].groupKey, a.members[1].groupKey);
  assert.deepEqual(
    a.members.map((member) => member.memberKey),
    ["a", "b"]
  );
  const standalone = projectReviewComparison(product("C", "S101"));
  assert.notEqual(a.scrollGroup, standalone.scrollGroup);
  assert.notEqual(standalone.scrollGroup, projectReviewComparison(product("D", "S57")).scrollGroup);
  assert.notEqual(
    standalone.scrollGroup,
    projectReviewComparison(product("E", "S101", { sourceId: "other-source" })).scrollGroup
  );
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
