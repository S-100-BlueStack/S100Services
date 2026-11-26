export function packageDatasetKey(name) {
  return typeof name === "string" ? name.trim().toUpperCase() : "";
}

export function normalizePackageStatusMessage(value) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() ? value : null;
}

export function matchPackageDetailStatus(detail, primaryDatasetName, members) {
  const observation = detail?.packageStatusObservation;
  if (!observation) return null;

  const primary = packageDatasetKey(primaryDatasetName);
  if (
    !primary ||
    (observation.sourceDatasetName !== undefined &&
      packageDatasetKey(observation.sourceDatasetName) !== primary)
  ) {
    return null;
  }

  // Workspace resolution owns mapping and source identity. Contradictory status
  // metadata makes this whole observation unusable, without changing that mapping.
  for (const member of members) {
    const observed = observation.members[member.key];
    const expectedName = packageDatasetKey(member.datasetName);
    const publishedName = detail.workUnitMetadata?.members?.[member.key]?.datasetName;
    if (
      !expectedName ||
      (observed && packageDatasetKey(observed.datasetName) !== expectedName) ||
      (publishedName && packageDatasetKey(publishedName) !== expectedName)
    ) {
      return null;
    }
  }
  return observation;
}

export function findPackageStatusMember(members, key, datasetName) {
  const name = packageDatasetKey(datasetName);
  if (!name || !Array.isArray(members)) return null;

  const matching = members.filter((member) => member?.key === key);
  return matching.length === 1 && packageDatasetKey(matching[0].datasetName) === name
    ? matching[0]
    : null;
}
