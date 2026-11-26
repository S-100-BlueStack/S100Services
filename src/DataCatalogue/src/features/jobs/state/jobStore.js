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
  let cancelOnNavigation = false;
  let errorBeforeLoad = null;
  let alive = true;
  let membershipRevision = 0;
  let loadedMembershipRevision = 0;
  let pendingMembershipLoad = null;
  let state = {
    jobs: [],
    isLoading: false,
    error: null,
    lastSuccessfulLoadAt: null,
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
      lastSuccessfulLoadAt: state.lastSuccessfulLoadAt,
      lastChange: {
        ...state.lastChange,
      },
    };
  }

  function hasPendingMembershipRefresh() {
    return loadedMembershipRevision !== membershipRevision;
  }

  function invalidateMembership() {
    if (!alive) return;
    membershipRevision++;
    // The active read may have started before the binding write.
    cancelLoad();
  }

  function loadJobs({ clear = false, cancelOnLeave = false } = {}) {
    if (!alive) return Promise.resolve({ ok: false, stale: true });
    const freshWorkspaceCatalogue = hasPendingMembershipRefresh();
    if (freshWorkspaceCatalogue && pendingMembershipLoad && !clear) {
      return pendingMembershipLoad;
    }

    const revision = membershipRevision;
    const current = ++loadGeneration;
    if (!loadAbort) errorBeforeLoad = state.error;
    loadAbort?.abort();
    const request = new AbortController();
    loadAbort = request;
    cancelOnNavigation =
      freshWorkspaceCatalogue || cancelOnLeave || state.lastSuccessfulLoadAt !== null;
    setState({
      ...(clear ? { jobs: [], lastSuccessfulLoadAt: null } : {}),
      isLoading: true,
      error: null,
    });

    const operation = completeLoad(request, current, revision, freshWorkspaceCatalogue);
    pendingMembershipLoad = freshWorkspaceCatalogue ? operation : null;
    return operation;
  }

  async function completeLoad(request, current, revision, freshWorkspaceCatalogue) {
    const result = await service.loadJobs({
      signal: request.signal,
      ...(freshWorkspaceCatalogue ? { freshWorkspaceCatalogue } : {}),
    });
    if (!alive || current !== loadGeneration || request.signal.aborted)
      return { ...result, stale: true };

    loadAbort = null;
    pendingMembershipLoad = null;
    if (result.ok) {
      loadedMembershipRevision = revision;
      setState(
        {
          jobs: result.data.jobs,
          lastSuccessfulLoadAt: Date.now(),
          isLoading: false,
          error: null,
          lastChange: createJobStoreChange(JOB_STORE_CHANGE_TYPE.JOBS_LOADED, {
            jobCount: result.data.jobs.length,
          }),
        },
        result.data.workspaceCatalogue
      );

      return result;
    }

    request.abort();
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
      loadAbort = null;
      pendingMembershipLoad = null;
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

  function cancelNavigationLoad() {
    // The initial catalogue/list may finish in the background, as on a direct
    // Assignment URL. A refresh started in Main Map belongs to that visit.
    if (cancelOnNavigation) cancelLoad();
  }

  function cancelLoad() {
    if (!loadAbort) return;
    loadGeneration++;
    loadAbort.abort();
    loadAbort = null;
    pendingMembershipLoad = null;
    setState({ isLoading: false, error: errorBeforeLoad });
  }

  function setState(partialState, workspaceCatalogue) {
    state = {
      ...state,
      ...partialState,
    };

    emit(workspaceCatalogue);
  }

  function emit(workspaceCatalogue) {
    const snapshot = getSnapshot();

    for (const listener of listeners) {
      listener(snapshot, workspaceCatalogue);
    }
  }

  return {
    destroy() {
      alive = false;
      loadGeneration++;
      loadAbort?.abort();
      pendingMembershipLoad = null;
      listeners.clear();
    },
    subscribe,
    loadJobs,
    invalidateMembership,
    hasPendingMembershipRefresh,
    cancelNavigationLoad,
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
