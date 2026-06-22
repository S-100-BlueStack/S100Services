import { createErrorResult, createSuccessResult } from "../../../shared/api/apiResult.js";
import { filterJobsForVisibleJobSet } from "../../jobs/domain/jobFilters.js";
import * as defaultJobService from "../../jobs/services/jobService.js";
import { buildAoiJobSummaries, buildAoiJobSummaryByAoiId } from "../domain/aoiJobSummary.js";
import {
  buildRelationsFromJobs,
  getAoiIdsForJob,
  getJobIdsForAoi,
  RELATION_SOURCE,
} from "../domain/relationModel.js";

export async function loadAoiJobRelations({
  jobs,
  jobService = defaultJobService,
  source = RELATION_SOURCE.MOCK,
} = {}) {
  const jobsResult = await resolveJobs({ jobs, jobService });

  if (!jobsResult.ok) {
    return createErrorResult(jobsResult.error, {
      operation: "loadAoiJobRelations",
      source,
    });
  }

  const relations = buildRelationsFromJobs(jobsResult.data.jobs, { source });

  return createSuccessResult(
    {
      relations,
    },
    {
      operation: "loadAoiJobRelations",
      source,
      relationCount: relations.length,
    }
  );
}

export async function loadAoiJobRelationSnapshot({
  jobs,
  jobService = defaultJobService,
  source = RELATION_SOURCE.MOCK,
  jobFilters,
} = {}) {
  const jobsResult = await resolveJobs({ jobs, jobService });

  if (!jobsResult.ok) {
    return createErrorResult(jobsResult.error, {
      operation: "loadAoiJobRelationSnapshot",
      source,
    });
  }

  const resolvedJobs = getSnapshotJobs({
    jobs: jobsResult.data.jobs,
    jobFilters,
    shouldApplyJobFilters: isJobFilterInputProvided(jobFilters),
  });
  const relations = buildRelationsFromJobs(resolvedJobs, { source });
  const summaryByAoiId = buildAoiJobSummaryByAoiId({
    jobs: resolvedJobs,
    relations,
  });

  return createSuccessResult(
    {
      relations,
      summaries: buildAoiJobSummaries({ jobs: resolvedJobs, relations }),
      summaryByAoiId: Object.fromEntries(summaryByAoiId.entries()),
    },
    {
      operation: "loadAoiJobRelationSnapshot",
      source,
      relationCount: relations.length,
      aoiSummaryCount: summaryByAoiId.size,
    }
  );
}

export function getJobsForAoi({ aoiId, jobs = [], relations = [] } = {}) {
  const jobIds = new Set(getJobIdsForAoi({ relations, aoiId }));

  return normalizeArray(jobs).filter((job) => jobIds.has(normalizeOptionalString(job.id)));
}

export function getJobsForAoiFromJobs({ aoiId, jobs = [] } = {}) {
  const resolvedJobs = normalizeArray(jobs);
  const relations = buildRelationsFromJobs(resolvedJobs);

  // Keep UI filtering source-agnostic so this can later use backend relations without changing Job UI.
  return getJobsForAoi({ aoiId, jobs: resolvedJobs, relations });
}

export function getAoisForJob({ jobId, aois = [], relations = [] } = {}) {
  const aoiIds = new Set(getAoiIdsForJob({ relations, jobId }));

  return normalizeArray(aois).filter((aoi) => aoiIds.has(normalizeOptionalString(aoi.id)));
}

function getSnapshotJobs({ jobs, jobFilters, shouldApplyJobFilters }) {
  const resolvedJobs = normalizeArray(jobs);

  if (!shouldApplyJobFilters) {
    return resolvedJobs;
  }

  return filterJobsForVisibleJobSet(resolvedJobs, jobFilters);
}

function isJobFilterInputProvided(jobFilters) {
  return jobFilters !== undefined;
}

async function resolveJobs({ jobs, jobService }) {
  if (Array.isArray(jobs)) {
    return createSuccessResult(
      {
        jobs,
      },
      {
        source: "provided-jobs",
      }
    );
  }

  if (!jobService?.loadJobs) {
    return createErrorResult(new Error("Job service is not available."), {
      source: "relation-service",
    });
  }

  return jobService.loadJobs();
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
