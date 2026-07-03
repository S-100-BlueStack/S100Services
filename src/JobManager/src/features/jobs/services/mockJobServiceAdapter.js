import { loadMockJobs, updateMockJobStatus } from "../mock/mockJobBackend.js";
import { JOB_SERVICE_ADAPTER_SOURCE } from "./jobServiceAdapterSource.js";

export function createMockJobServiceAdapter() {
  return {
    source: JOB_SERVICE_ADAPTER_SOURCE.MOCK,

    async loadJobs() {
      const jobs = await loadMockJobs();

      return {
        jobs,
      };
    },

    updateJobStatus(jobId, status) {
      return updateMockJobStatus(jobId, status);
    },
  };
}
