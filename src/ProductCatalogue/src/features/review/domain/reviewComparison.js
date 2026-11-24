import { normalizeElectronicProductStatus } from "../../dataSources/domain/electronicProductStatus.js";
import { serializeProductIdentity } from "../../dataSources/domain/productIdentity.js";
import { reviewDatasetKey } from "./reviewWorkUnits.js";

// Comparison is a read-only projection of the published Review payload. In particular,
// aggregate Package status and stale retained metadata are not member metadata.
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
    const metadata = isPackage ? member : attributes;
    const electronic = specification === "S101" || specification === "S57";
    return {
      identity,
      memberKey: declaration?.key ?? null,
      // A source with the same display label is not necessarily the same data contract.
      groupKey: JSON.stringify([context.sourceId, context.productType, specification]),
      status: electronic ? (normalizeElectronicProductStatus(metadata?.status) ?? null) : null,
      edition: electronic ? normalizeEdition(metadata?.edition) : null,
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

// Every known differing value is marked, not only deviations from an arbitrary first Product.
// Missing values never participate, and duplicate identities cannot become comparison peers.
export function getReviewMetadataDifferences(projections) {
  const groups = new Map();
  for (const projection of projections) {
    for (const member of projection.members) {
      if (!groups.has(member.groupKey)) groups.set(member.groupKey, new Map());
      const group = groups.get(member.groupKey);
      if (!group.has(member.identity)) {
        group.set(member.identity, member);
      } else {
        const existing = group.get(member.identity);
        // Contradictory duplicate values cannot become evidence for a difference.
        group.set(member.identity, {
          ...existing,
          status: existing.status === member.status ? existing.status : null,
          edition: existing.edition === member.edition ? existing.edition : null,
        });
      }
    }
  }
  const differences = new Map();
  for (const group of groups.values()) {
    for (const field of ["status", "edition"]) {
      const known = [...group.values()].filter((member) => member[field] !== null);
      if (new Set(known.map((member) => member[field])).size < 2) continue;
      for (const member of known) {
        if (!differences.has(member.identity)) differences.set(member.identity, new Set());
        differences.get(member.identity).add(field);
      }
    }
  }
  return differences;
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

function normalizeEdition(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value.trim()))) {
    return null;
  }
  const edition = Number(value);
  return Number.isSafeInteger(edition) && edition >= 0 ? edition : null;
}
