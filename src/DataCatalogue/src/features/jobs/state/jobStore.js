import * as jobService from "../services/jobService.js";

export const JOB_STORE_CHANGE_TYPE = Object.freeze({
  INITIAL: "initial",
  JOBS_LOADED: "jobsLoaded",
  JOBS_LOAD_FAILED: "jobsLoadFailed",
  JOB_STATUS_UPDATED: "jobStatusUpdated",
  JOB_STATUS_UPDATE_FAILED: "jobStatusUpdateFailed",
});

export function createJobStore({ service = jobService } = {}) {
  let changeSequence = 0;
  let loadGeneration = 0;
  let loadAbort = null;
  let alive = true;
  let state = {
    jobs: [],
    isLoading: false,
    error: null,
    lastChange: createInitialJobStoreChange(),
  };

  const listeners = new Set();

  function subscribe(listener) {
    listeners.add(listener);
    listener(getSnapshot());

    return () => {
      listeners.delete(listener);
    };
  }

  function getSnapshot() {
    return {
      jobs: state.jobs.map(cloneJob),
      isLoading: state.isLoading,
      error: state.error,
      lastChange: {
        ...state.lastChange,
      },
    };
  }

  async function loadJobs({ clear = false } = {}) {
    const current = ++loadGeneration;
    loadAbort?.abort();
    const request = new AbortController();
    loadAbort = request;
    setState({
      ...(clear ? { jobs: [] } : {}),
      isLoading: true,
      error: null,
    });

    const result = await service.loadJobs({ signal: request.signal });
    if (!alive || current !== loadGeneration || request.signal.aborted)
      return { ...result, stale: true };

    if (result.ok) {
      setState({
        jobs: result.data.jobs,
        isLoading: false,
        error: null,
        lastChange: createJobStoreChange(JOB_STORE_CHANGE_TYPE.JOBS_LOADED, {
          jobCount: result.data.jobs.length,
        }),
      });

      return result;
    }

    setState({
      isLoading: false,
      error: result.error,
      lastChange: createJobStoreChange(JOB_STORE_CHANGE_TYPE.JOBS_LOAD_FAILED),
    });

    return result;
  }

  async function updateJobStatus(jobId, status) {
    const current = loadGeneration;
    const result = await service.updateJobStatus(jobId, status);
    if (!alive || current !== loadGeneration) return { ...result, stale: true };

    if (result.ok) {
      // A read started before this mutation must not restore the previous status.
      loadAbort?.abort();
      setState({
        isLoading: false,
        jobs: applyJobMutationResult(state.jobs, result.data),
        error: null,
        lastChange: createJobStoreChange(JOB_STORE_CHANGE_TYPE.JOB_STATUS_UPDATED, {
          jobId: result.data.job.id,
          status: result.data.job.status,
          createdJobCount: Array.isArray(result.data.createdJobs)
            ? result.data.createdJobs.length
            : 0,
        }),
      });
    } else {
      setState({
        error: result.error,
        lastChange: createJobStoreChange(JOB_STORE_CHANGE_TYPE.JOB_STATUS_UPDATE_FAILED, {
          jobId,
          status,
        }),
      });
    }

    return result;
  }

  function createJobStoreChange(type, data = {}) {
    changeSequence += 1;

    return {
      type,
      sequence: changeSequence,
      ...data,
    };
  }

  function setState(partialState) {
    state = {
      ...state,
      ...partialState,
    };

    emit();
  }

  function emit() {
    const snapshot = getSnapshot();

    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  return {
    destroy() {
      alive = false;
      loadGeneration++;
      loadAbort?.abort();
      listeners.clear();
    },
    subscribe,
    loadJobs,
    updateJobStatus,
    getSnapshot,
  };
}

function createInitialJobStoreChange() {
  return {
    type: JOB_STORE_CHANGE_TYPE.INITIAL,
    sequence: 0,
  };
}

function cloneJob(job) {
  return {
    ...job,
    relatedAoiIds: Array.isArray(job.relatedAoiIds) ? [...job.relatedAoiIds] : [],
  };
}

function applyJobMutationResult(currentJobs, mutationResult) {
  return currentJobs.map((job) => (job.id === mutationResult.job.id ? mutationResult.job : job));
}
