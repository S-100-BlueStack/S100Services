export function projectMemberStatusRenderState({ representativeStatus, workUnitStatus } = {}) {
  const memberStatuses = normalizeMemberStatuses(workUnitStatus?.members);

  if (memberStatuses.length === 0) {
    return {
      kind: "scalar",
      status: representativeStatus,
      memberStatuses,
    };
  }

  if (memberStatuses.length === 1) {
    return {
      kind: "scalar",
      status: memberStatuses[0],
      memberStatuses,
    };
  }

  return {
    kind: "mixed",
    status: null,
    memberStatuses,
  };
}

function normalizeMemberStatuses(members) {
  if (!Array.isArray(members)) {
    return [];
  }

  const statuses = members.map((member) => normalizeStatus(member?.status)).filter(Boolean);
  return [...new Set(statuses)].sort(compareStatusValues);
}

function normalizeStatus(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function compareStatusValues(left, right) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
