// The electronic AOI normalizer owns this normalized application field; transport aliases stay there.
// No member is inferred from the representative Product when its status is absent.
export function projectWorkUnitStatusValues({ representativeStatus, workUnitStatus } = {}) {
  const candidates = [
    workUnitStatus?.workflowStatus,
    ...(Array.isArray(workUnitStatus?.members)
      ? workUnitStatus.members.map((member) => member?.status)
      : []),
  ];
  const values = [...new Set(candidates.filter(hasStatus).map(String))];
  return values.length ? values : [representativeStatus];
}

export function readWorkUnitStatusFilterValues(graphic, readScalar) {
  return projectWorkUnitStatusValues({
    representativeStatus: readScalar(),
    workUnitStatus: graphic?.attributes?.workUnitStatus,
  });
}

function hasStatus(value) {
  return value !== null && value !== undefined && value !== "";
}
