import { JOB_PRIORITY } from "../../jobs/domain/jobPriority.js";
import { isActiveJobStatus } from "../../jobs/domain/jobStatus.js";
import { buildRelationsFromJobs, normalizeRelations } from "./relationModel.js";

export function createEmptyAoiJobSummary(aoiId = "") {
  return {
    aoiId: normalizeOptionalString(aoiId),
    total: 0,
    active: 0,
    highPriority: 0,
    activeHighPriority: 0,
    jobIds: [],
  };
}

export function buildAoiJobSummaryByAoiId({ jobs = [], relations } = {}) {
  const normalizedJobs = normalizeArray(jobs);
  const normalizedRelations = relations
    ? normalizeRelations(relations)
    : buildRelationsFromJobs(normalizedJobs);
  const jobsById = new Map(
    normalizedJobs
      .map((job) => [normalizeOptionalString(job.id), job])
      .filter(([jobId]) => Boolean(jobId))
  );
  const summaryStateByAoiId = new Map();

  for (const relation of normalizedRelations) {
    const job = jobsById.get(relation.jobId);

    if (!job) {
      continue;
    }

    for (const aoiId of relation.aoiIds) {
      const summaryState = getOrCreateSummaryState(summaryStateByAoiId, aoiId);

      // A relation source can contain duplicate rows later, so keep counts stable per Job/AOI pair.
      if (summaryState.jobIds.has(relation.jobId)) {
        continue;
      }

      const isActive = isActiveJobStatus(job.status);
      const isHighPriority = job.priority === JOB_PRIORITY.HIGH;

      summaryState.jobIds.add(relation.jobId);
      summaryState.total += 1;

      if (isActive) {
        summaryState.active += 1;
      }

      if (isHighPriority) {
        summaryState.highPriority += 1;
      }

      if (isActive && isHighPriority) {
        summaryState.activeHighPriority += 1;
      }
    }
  }

  return new Map(
    [...summaryStateByAoiId.entries()].map(([aoiId, summaryState]) => [
      aoiId,
      freezeSummary(summaryState),
    ])
  );
}

export function buildAoiJobSummaries({ jobs = [], relations } = {}) {
  return [...buildAoiJobSummaryByAoiId({ jobs, relations }).values()];
}

export function getAoiJobSummary(summaryByAoiId, aoiId) {
  if (!(summaryByAoiId instanceof Map)) {
    return createEmptyAoiJobSummary(aoiId);
  }

  return summaryByAoiId.get(normalizeOptionalString(aoiId)) ?? createEmptyAoiJobSummary(aoiId);
}

export function toAoiModelJobSummary(summary) {
  return {
    total: normalizeCount(summary?.total),
    active: normalizeCount(summary?.active),
    highPriority: normalizeCount(summary?.highPriority),
  };
}

function getOrCreateSummaryState(summaryStateByAoiId, aoiId) {
  const normalizedAoiId = normalizeOptionalString(aoiId);
  const existingSummaryState = summaryStateByAoiId.get(normalizedAoiId);

  if (existingSummaryState) {
    return existingSummaryState;
  }

  const summaryState = {
    aoiId: normalizedAoiId,
    total: 0,
    active: 0,
    highPriority: 0,
    activeHighPriority: 0,
    jobIds: new Set(),
  };

  summaryStateByAoiId.set(normalizedAoiId, summaryState);

  return summaryState;
}

function freezeSummary(summaryState) {
  return Object.freeze({
    aoiId: summaryState.aoiId,
    total: summaryState.total,
    active: summaryState.active,
    highPriority: summaryState.highPriority,
    activeHighPriority: summaryState.activeHighPriority,
    jobIds: [...summaryState.jobIds],
  });
}

function normalizeCount(value) {
  const count = Number(value);

  if (!Number.isFinite(count) || count < 0) {
    return 0;
  }

  return Math.trunc(count);
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
