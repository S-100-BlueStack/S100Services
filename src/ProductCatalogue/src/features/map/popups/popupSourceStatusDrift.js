import { normalizeElectronicProductStatus } from "../../dataSources/domain/electronicProductStatus.js";
import { normalizeEncPackageStatus } from "../../dataSources/domain/encPackageStatus.js";
import {
  findPackageStatusMember,
  matchPackageDetailStatus,
  normalizePackageStatusMessage,
  packageDatasetKey,
} from "../../dataSources/domain/encPackageStatusObservation.js";

// AOI owns map status. A coherent detail observation can request a source read,
// but neither the compatibility scalar nor detail itself can replace AOI state.
export function detectPackagePopupStatusDrift({ productContext, attributes, detail } = {}) {
  const workUnit = productContext?.workUnit;
  if (workUnit?.kind !== "package" || !Array.isArray(workUnit.members)) return null;

  const sourceId = productContext.sourceId;
  const datasetName = productContext.datasetName;
  const datasetKey = packageDatasetKey(datasetName);
  const primary = workUnit.members.find(({ key }) => key === workUnit.primaryMemberKey);
  if (
    !datasetKey ||
    !sourceId ||
    primary?.sourceId !== sourceId ||
    attributes?.sourceId !== sourceId ||
    packageDatasetKey(attributes?.datasetName) !== datasetKey ||
    packageDatasetKey(detail?.datasetName) !== datasetKey
  ) {
    return null;
  }

  const current = attributes.workUnitStatus;
  const expectedMembers = workUnit.members.map(({ key }) => ({
    key,
    datasetName: attributes.workUnitMetadata?.members?.[key]?.datasetName,
  }));
  const keys = expectedMembers.map(({ datasetName }) => packageDatasetKey(datasetName));
  if (
    expectedMembers.length < 2 ||
    new Set(keys).size !== keys.length ||
    packageDatasetKey(expectedMembers.find(({ key }) => key === primary.key)?.datasetName) !==
      datasetKey
  ) {
    return null;
  }

  const observed = matchPackageDetailStatus(detail, datasetName, expectedMembers);
  if (packageDatasetKey(observed?.sourceDatasetName) !== datasetKey) return null;

  // Require all corresponding identities before treating any difference as drift.
  // Status and message can still be unknown independently within that validated pair.
  const pairs = [];
  for (const { key, datasetName: memberName } of expectedMembers) {
    const currentMember = findPackageStatusMember(current?.members, key, memberName);
    const observedMember = observed.members[key];
    if (!currentMember || !observedMember) return null;
    pairs.push([currentMember, observedMember]);
  }

  const changed =
    hasStatusDifference(
      { status: current.packageStatus, errorMessage: current.errorMessage },
      observed,
      normalizeEncPackageStatus
    ) ||
    pairs.some(([left, right]) =>
      hasStatusDifference(left, right, normalizeElectronicProductStatus)
    );

  return changed ? { sourceId, datasetName } : null;
}

function hasStatusDifference(current, observed, normalizeStatus) {
  const currentStatus = normalizeStatus(current.status);
  const observedStatus = normalizeStatus(observed.status);
  if (currentStatus === undefined || observedStatus === undefined) return false;
  if (currentStatus !== observedStatus) return true;

  const currentMessage = normalizePackageStatusMessage(current.errorMessage);
  const observedMessage = normalizePackageStatusMessage(observed.errorMessage);
  return (
    currentMessage !== undefined &&
    observedMessage !== undefined &&
    currentMessage !== observedMessage
  );
}
