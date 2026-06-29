import * as jobService from "../services/jobService.js";

export function createJobStore({ service = jobService } = {}) {
  let state = {
    jobs: [],
    isLoading: false,
    error: null,
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
      jobs: state.jobs.map((job) => ({
        ...job,
        relatedAoiIds: [...job.relatedAoiIds],
      })),
      isLoading: state.isLoading,
      error: state.error,
    };
  }

  async function loadJobs() {
    setState({
      isLoading: true,
      error: null,
    });

    const result = await service.loadJobs();

    if (result.ok) {
      setState({
        jobs: result.data.jobs,
        isLoading: false,
        error: null,
      });

      return result;
    }

    setState({
      isLoading: false,
      error: result.error,
    });

    return result;
  }

  async function updateJobStatus(jobId, status) {
    const result = await service.updateJobStatus(jobId, status);

    if (result.ok) {
      setState({
        jobs: applyJobMutationResult(state.jobs, result.data),
        error: null,
      });
    } else {
      setState({
        error: result.error,
      });
    }

    return result;
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
    subscribe,
    loadJobs,
    updateJobStatus,
    getSnapshot,
  };
}

function applyJobMutationResult(currentJobs, mutationResult) {
  return currentJobs.map((job) => (job.id === mutationResult.job.id ? mutationResult.job : job));
}
