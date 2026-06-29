import { toApiResult } from "../../../shared/api/apiResult.js";
import { loadMockJobs, updateMockJobStatus } from "../mock/mockJobBackend.js";

export async function loadJobs() {
  return toApiResult(
    async () => {
      const jobs = await loadMockJobs();

      return {
        jobs,
      };
    },
    {
      source: "mock",
    }
  );
}

export async function updateJobStatus(jobId, status) {
  return toApiResult(async () => updateMockJobStatus(jobId, status), {
    source: "mock",
    jobId,
  });
}
