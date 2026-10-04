import { apiRequest } from "../../../shared/api/apiClient.js";

const JOB_REQUEST_TIMEOUT_MS = 0;
const JOB_STATUS_TIMEOUT_MS = 15_000;

export function startProductJob(path) {
  return apiRequest(path, {
    method: "POST",
    timeoutMs: JOB_REQUEST_TIMEOUT_MS,
  });
}

export function getProductJobStatus(jobId) {
  if (!jobId) {
    return Promise.resolve({
      success: false,
      errorMessage: "Cannot get product job status without a jobId.",
    });
  }

  return apiRequest(buildProductJobStatusPath(jobId), {
    timeoutMs: JOB_STATUS_TIMEOUT_MS,
  });
}

export function getActiveProductJobs(datasetName) {
  if (!datasetName) {
    return Promise.resolve({
      success: false,
      errorMessage: "Cannot get active product jobs without a datasetName.",
    });
  }

  return apiRequest(buildActiveProductJobsPath(datasetName), {
    timeoutMs: JOB_STATUS_TIMEOUT_MS,
  });
}

export function buildProductJobStatusPath(jobId) {
  return `jobs/${encodeURIComponent(jobId)}`;
}

export function buildActiveProductJobsPath(datasetName) {
  const query = new URLSearchParams({ datasetName });
  return `jobs/active?${query.toString()}`;
}
