import { serializeProductIdentity } from "../../dataSources/domain/productIdentity.js";

export const reviewDatasetKey = (name) =>
  String(name ?? "")
    .trim()
    .toUpperCase();

// The signature contains identity and mapping, never mutable content revisions.
export function getReviewWorkUnitSignature(resolution) {
  const unit = resolution?.workUnit;
  if (unit?.kind !== "package") return null;
  validateReviewPackage(resolution);
  return JSON.stringify([
    unit.identityKey,
    unit.primaryMemberKey,
    unit.members.map((member, index) => [
      member.key,
      member.sourceId,
      reviewDatasetKey(member.datasetName),
      serializeProductIdentity(resolution.memberProducts[index]),
      resolution.memberProducts[index].data.attributes.productSpecification,
    ]),
  ]);
}

export function validateReviewPackage(resolution) {
  const unit = resolution?.workUnit;
  const contexts = resolution?.memberProducts;
  const representative = resolution?.product;
  const members = unit?.members;
  requirePackageIdentity(
    resolution?.status === "resolved" &&
      unit?.kind === "package" &&
      unit.identityKey &&
      Array.isArray(members) &&
      members.length === 2 &&
      contexts?.length === members.length &&
      new Set(members.map((member) => member.key)).size === members.length &&
      new Set(members.map((member) => reviewDatasetKey(member.datasetName))).size === members.length
  );
  for (const [index, member] of members.entries()) {
    const context = contexts[index];
    requirePackageIdentity(
      context &&
        context.sourceId === member.sourceId &&
        reviewDatasetKey(context.datasetName) === reviewDatasetKey(member.datasetName) &&
        serializeProductIdentity(context) &&
        context.data?.attributes?.productSpecification
    );
  }
  const primaryIndex = members.findIndex((member) => member.key === unit.primaryMemberKey);
  requirePackageIdentity(
    primaryIndex === 0 &&
      reviewDatasetKey(representative?.datasetName) ===
        reviewDatasetKey(members[primaryIndex]?.datasetName) &&
      serializeProductIdentity(representative) === serializeProductIdentity(contexts[primaryIndex])
  );
}

export function getReviewResolutionAliases(resolution) {
  return [
    resolution.requestedDatasetName,
    resolution.product?.datasetName,
    ...(resolution.workUnit?.members ?? []).map((member) => member.datasetName),
  ]
    .map(reviewDatasetKey)
    .filter(Boolean);
}

function requirePackageIdentity(condition) {
  if (!condition) {
    throw new Error("Review package member identity is incomplete or contradictory.");
  }
}
