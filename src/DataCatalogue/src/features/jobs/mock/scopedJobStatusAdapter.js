import { JOB_STATUS, JOB_STATUS_OPTIONS } from "../domain/jobStatus.js";
import { requiredId } from "../../../shared/api/catalogueService.js";

export function scopedJobId({ packageId, pipelineId, workspaceId }) {
  return JSON.stringify([requiredId(packageId), requiredId(pipelineId), requiredId(workspaceId)]);
}

export function createScopedJobStatusAdapter() {
  const values = new Map();
  return {
    get(context) {
      return values.get(scopedJobId(context)) ?? JOB_STATUS.TODO;
    },
    set(context, status) {
      if (!JOB_STATUS_OPTIONS.some((option) => option.value === status))
        throw new Error("Unknown mock Job status.");
      values.set(scopedJobId(context), status);
      return status;
    },
    reset() {
      values.clear();
    },
  };
}
