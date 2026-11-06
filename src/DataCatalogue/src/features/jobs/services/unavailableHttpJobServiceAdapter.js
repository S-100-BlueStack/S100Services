import { JOB_SERVICE_ADAPTER_SOURCE } from "./jobServiceAdapterSource.js";

export function createUnavailableHttpJobServiceAdapter() {
  return {
    source: JOB_SERVICE_ADAPTER_SOURCE.HTTP,

    loadJobs() {
      throw createUnavailableHttpAdapterError();
    },

    updateJobStatus() {
      throw createUnavailableHttpAdapterError();
    },
  };
}

function createUnavailableHttpAdapterError() {
  return {
    name: "JobServiceAdapterError",
    message: "HTTP Job adapter is not configured yet.",
    userMessage: "Job backend is not configured yet.",
    status: 501,
    code: "JOB_HTTP_ADAPTER_UNAVAILABLE",
  };
}
