import { JOB_PRIORITY, JOB_PRIORITY_OPTIONS } from "./jobPriority.js";
import { JOB_STATUS, JOB_STATUS_OPTIONS } from "./jobStatus.js";

const VALID_STATUS_VALUES = new Set(JOB_STATUS_OPTIONS.map((option) => option.value));
const VALID_PRIORITY_VALUES = new Set(JOB_PRIORITY_OPTIONS.map((option) => option.value));

export function createDefaultJobFilters() {
  return {
    activeOnly: false,
    highPriorityOnly: false,
    withRelatedAoisOnly: false,
    statusValues: [],
    priorityValues: [],
  };
}

export function normalizeJobFilters(filters = {}) {
  return {
    activeOnly: Boolean(filters.activeOnly),
    highPriorityOnly: Boolean(filters.highPriorityOnly),
    withRelatedAoisOnly: Boolean(filters.withRelatedAoisOnly),
    statusValues: normalizeValues(filters.statusValues, VALID_STATUS_VALUES),
    priorityValues: normalizeValues(filters.priorityValues, VALID_PRIORITY_VALUES),
  };
}

export function filterJobs(jobs = [], filters = createDefaultJobFilters()) {
  const normalizedFilters = normalizeJobFilters(filters);
  const statusValues = new Set(normalizedFilters.statusValues);
  const priorityValues = new Set(normalizedFilters.priorityValues);

  return normalizeArray(jobs).filter((job) => {
    if (normalizedFilters.activeOnly && job.status === JOB_STATUS.DONE) {
      return false;
    }

    if (normalizedFilters.highPriorityOnly && job.priority !== JOB_PRIORITY.HIGH) {
      return false;
    }

    if (normalizedFilters.withRelatedAoisOnly && normalizeArray(job.relatedAoiIds).length === 0) {
      return false;
    }

    if (statusValues.size > 0 && !statusValues.has(job.status)) {
      return false;
    }

    if (priorityValues.size > 0 && !priorityValues.has(job.priority)) {
      return false;
    }

    return true;
  });
}

export function hasActiveJobFilters(filters = createDefaultJobFilters()) {
  const normalizedFilters = normalizeJobFilters(filters);

  return (
    normalizedFilters.activeOnly ||
    normalizedFilters.highPriorityOnly ||
    normalizedFilters.withRelatedAoisOnly ||
    normalizedFilters.statusValues.length > 0 ||
    normalizedFilters.priorityValues.length > 0
  );
}

export function shouldRevealDoneJobsForFilters(filters = createDefaultJobFilters()) {
  const normalizedFilters = normalizeJobFilters(filters);

  return normalizedFilters.statusValues.includes(JOB_STATUS.DONE);
}

export function getActiveJobFilterSummary(filters = createDefaultJobFilters()) {
  const normalizedFilters = normalizeJobFilters(filters);
  const summaryParts = [];

  if (normalizedFilters.activeOnly) {
    summaryParts.push("Active Jobs");
  }

  if (normalizedFilters.highPriorityOnly) {
    summaryParts.push("High Priority");
  }

  if (normalizedFilters.withRelatedAoisOnly) {
    summaryParts.push("Jobs with AOIs");
  }

  if (normalizedFilters.statusValues.length > 0) {
    summaryParts.push(`${normalizedFilters.statusValues.length} status filter`);
  }

  if (normalizedFilters.priorityValues.length > 0) {
    summaryParts.push(`${normalizedFilters.priorityValues.length} priority filter`);
  }

  return summaryParts.length > 0 ? summaryParts.join(", ") : "No filters active";
}

function normalizeValues(values, validValues) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(values.map(normalizeOptionalString).filter((value) => validValues.has(value))),
  ];
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
