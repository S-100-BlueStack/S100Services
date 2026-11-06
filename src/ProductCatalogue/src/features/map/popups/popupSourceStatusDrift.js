import { normalizeElectronicProductStatus } from "../../dataSources/domain/electronicProductStatus.js";

// Product detail describes the primary Product track, not the package aggregate.
// AOI owns the map's member statuses and symbols: request an authoritative
// source reload rather than publishing detail status into a Graphic.
export function detectPackagePopupStatusDrift({ productContext, attributes, detail } = {}) {
  const workUnit = productContext?.workUnit;
  if (workUnit?.kind !== "package" || !workUnit.primaryMemberKey) return null;

  const sourceId = String(productContext.sourceId ?? "").trim();
  const datasetName = String(productContext.datasetName ?? "").trim();
  const normalized = (value) =>
    String(value ?? "")
      .trim()
      .toUpperCase();
  if (!sourceId || !normalized(datasetName)) return null;
  if (attributes?.sourceId !== sourceId) return null;
  if (normalized(attributes?.datasetName) !== normalized(datasetName)) return null;
  if (detail?.datasetName && normalized(detail.datasetName) !== normalized(datasetName))
    return null;

  const members = attributes?.workUnitStatus?.members;
  if (!Array.isArray(members)) return null;
  const member = members.find((item) => item.key === workUnit.primaryMemberKey);
  if (
    !member ||
    (member.datasetName && normalized(member.datasetName) !== normalized(datasetName))
  ) {
    return null;
  }

  const currentStatus = normalizeElectronicProductStatus(member.status);
  const detailStatus = normalizeElectronicProductStatus(detail?.status);
  if (currentStatus === undefined || detailStatus === undefined || currentStatus === detailStatus) {
    return null;
  }

  return { sourceId, datasetName };
}
