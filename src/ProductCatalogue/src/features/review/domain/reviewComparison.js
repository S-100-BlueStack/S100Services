import { serializeProductIdentity } from "../../dataSources/domain/productIdentity.js";
import { reviewDatasetKey } from "./reviewWorkUnits.js";

// Scroll peers are a read-only projection of published Review work units.
// Only compatible, verified member layouts may synchronize.
export function projectReviewComparison(product) {
  if (
    !product?.productContext ||
    product.loadState === "loading" ||
    product.resolutionFailed ||
    product.refreshError
  ) {
    return null;
  }

  const isPackage = product.workUnit?.kind === "package";
  const members = isPackage ? product.members : [product];
  if (
    !Array.isArray(members) ||
    (isPackage && (members.length !== 2 || product.workUnit.members?.length !== members.length))
  ) {
    return null;
  }

  const projections = members.map((member, index) => {
    const declaration = isPackage ? product.workUnit.members[index] : null;
    const context = member?.productContext;
    if (
      !context ||
      ![context.sourceId, context.productKey, context.productType].every(
        (value) => typeof value === "string" && value.trim().length > 0
      ) ||
      (isPackage && !declaration?.key) ||
      !reviewDatasetKey(member.datasetName) ||
      reviewDatasetKey(context.datasetName) !== reviewDatasetKey(member.datasetName) ||
      (declaration &&
        (declaration.key !== member.memberKey ||
          declaration.sourceId !== context.sourceId ||
          reviewDatasetKey(declaration.datasetName) !== reviewDatasetKey(member.datasetName)))
    ) {
      return null;
    }

    const identity = serializeProductIdentity(context);
    if (context.identityKey !== identity) return null;
    const attributes = context.data?.attributes;
    const specification = normalizeSpecification(attributes?.productSpecification);
    if (
      isPackage &&
      (!specification || normalizeSpecification(member.productSpecification) !== specification)
    ) {
      return null;
    }
    return {
      identity,
      memberKey: declaration?.key ?? null,
      // A source with the same display label is not necessarily the same data contract.
      groupKey: JSON.stringify([context.sourceId, context.productType, specification]),
    };
  });
  if (
    projections.some((member) => !member) ||
    new Set(projections.map((member) => member.identity)).size !== projections.length ||
    new Set(projections.map((member) => member.groupKey)).size !== projections.length
  ) {
    return null;
  }
  if (
    isPackage &&
    (product.workUnit.primaryMemberKey !== projections[0].memberKey ||
      product.productContext.identityKey !== projections[0].identity ||
      reviewDatasetKey(product.datasetName) !== reviewDatasetKey(members[0].datasetName))
  ) {
    return null;
  }
  return {
    kind: isPackage ? "package" : "product",
    members: projections,
    scrollGroup: JSON.stringify([isPackage, projections.map((member) => member.groupKey)]),
  };
}

// Map the visible top of a column to the same section in a peer. The ratio is local
// to that section, rather than a percentage of the entire (possibly different) column.
export function getReviewSynchronizedScrollTop(source, target, scrollTop, targetMax) {
  const anchor = source.findLast((item) => item.top <= scrollTop + 0.5) ?? source[0];
  if (!anchor) return null;
  const peer = target.find((item) => item.key === anchor.key);
  if (!peer) return null;
  const progress = Math.max(0, Math.min(1, (scrollTop - anchor.top) / Math.max(1, anchor.height)));
  return Math.max(0, Math.min(targetMax, peer.top + progress * peer.height));
}

function normalizeSpecification(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim().toUpperCase().replaceAll("-", "");
  if (!normalized || normalized === "UNKNOWN") return null;
  if (normalized === "101") return "S101";
  if (normalized === "57") return "S57";
  return normalized;
}
