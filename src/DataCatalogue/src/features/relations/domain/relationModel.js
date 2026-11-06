export const RELATION_SOURCE = Object.freeze({
  MOCK: "mock",
  FRONTEND_GEOMETRY: "frontendGeometry",
  BACKEND: "backend",
});

const RELATION_SOURCE_VALUES = new Set(Object.values(RELATION_SOURCE));

export function normalizeRelation(rawRelation = {}) {
  return {
    jobId: normalizeOptionalString(rawRelation.jobId),
    aoiIds: normalizeStringArray(rawRelation.aoiIds),
    source: normalizeRelationSource(rawRelation.source),
  };
}

export function buildRelationsFromJobs(jobs = [], { source = RELATION_SOURCE.MOCK } = {}) {
  return normalizeArray(jobs)
    .map((job) =>
      normalizeRelation({
        jobId: job.id,
        aoiIds: job.relatedAoiIds,
        source,
      })
    )
    .filter((relation) => relation.jobId && relation.aoiIds.length > 0);
}

export function getAoiIdsForJob({ relations = [], jobId } = {}) {
  const normalizedJobId = normalizeOptionalString(jobId);

  if (!normalizedJobId) {
    return [];
  }

  const aoiIds = new Set();

  for (const relation of normalizeRelations(relations)) {
    if (relation.jobId !== normalizedJobId) {
      continue;
    }

    for (const aoiId of relation.aoiIds) {
      aoiIds.add(aoiId);
    }
  }

  return [...aoiIds];
}

export function getJobIdsForAoi({ relations = [], aoiId } = {}) {
  const normalizedAoiId = normalizeOptionalString(aoiId);

  if (!normalizedAoiId) {
    return [];
  }

  const jobIds = new Set();

  for (const relation of normalizeRelations(relations)) {
    if (relation.aoiIds.includes(normalizedAoiId)) {
      jobIds.add(relation.jobId);
    }
  }

  return [...jobIds];
}

export function groupAoiIdsByJobId(relations = []) {
  const groupedAoiIds = new Map();

  for (const relation of normalizeRelations(relations)) {
    const existingAoiIds = groupedAoiIds.get(relation.jobId) ?? new Set();

    for (const aoiId of relation.aoiIds) {
      existingAoiIds.add(aoiId);
    }

    groupedAoiIds.set(relation.jobId, existingAoiIds);
  }

  return new Map([...groupedAoiIds.entries()].map(([jobId, aoiIds]) => [jobId, [...aoiIds]]));
}

export function groupJobIdsByAoiId(relations = []) {
  const groupedJobIds = new Map();

  for (const relation of normalizeRelations(relations)) {
    for (const aoiId of relation.aoiIds) {
      const existingJobIds = groupedJobIds.get(aoiId) ?? new Set();
      existingJobIds.add(relation.jobId);
      groupedJobIds.set(aoiId, existingJobIds);
    }
  }

  return new Map([...groupedJobIds.entries()].map(([aoiId, jobIds]) => [aoiId, [...jobIds]]));
}

export function normalizeRelations(relations = []) {
  return normalizeArray(relations)
    .map((relation) => normalizeRelation(relation))
    .filter((relation) => relation.jobId && relation.aoiIds.length > 0);
}

function normalizeRelationSource(source) {
  if (RELATION_SOURCE_VALUES.has(source)) {
    return source;
  }

  return RELATION_SOURCE.MOCK;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const values = value.map((item) => normalizeOptionalString(item)).filter(Boolean);

  return [...new Set(values)];
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value;
}
