import { toApiResult } from "../../../shared/api/apiResult.js";
import { createJobServiceAdapter } from "./jobServiceAdapter.js";

const defaultJobService = createJobService();

export function createJobService({ adapter = createJobServiceAdapter() } = {}) {
  validateJobServiceAdapter(adapter);

  return {
    loadJobs() {
      return toApiResult(
        async () => {
          const jobsResult = await adapter.loadJobs();

          return {
            jobs: jobsResult.jobs,
          };
        },
        {
          source: adapter.source,
        }
      );
    },

    updateJobStatus(jobId, status) {
      return toApiResult(async () => adapter.updateJobStatus(jobId, status), {
        source: adapter.source,
        jobId,
      });
    },
  };
}

export async function loadJobs() {
  return defaultJobService.loadJobs();
}

export async function updateJobStatus(jobId, status) {
  return defaultJobService.updateJobStatus(jobId, status);
}

function validateJobServiceAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new Error("Job service adapter must be an object.");
  }

  validateAdapterMethod(adapter, "loadJobs");
  validateAdapterMethod(adapter, "updateJobStatus");
}

function validateAdapterMethod(adapter, methodName) {
  if (typeof adapter[methodName] !== "function") {
    throw new Error(`Job service adapter must implement ${methodName}().`);
  }
}
