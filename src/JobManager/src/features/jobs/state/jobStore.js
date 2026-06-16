import * as jobService from "../services/jobService.js";

export function createJobStore({ service = jobService } = {}) {
  let state = {
    jobs: [],
    isLoading: false,
    error: null,
    updatingJobIds: new Set(),
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
      updatingJobIds: new Set(state.updatingJobIds),
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
    setUpdatingJob(jobId, true);

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

    setUpdatingJob(jobId, false);

    return result;
  }

  function setUpdatingJob(jobId, isUpdating) {
    const updatingJobIds = new Set(state.updatingJobIds);

    if (isUpdating) {
      updatingJobIds.add(jobId);
    } else {
      updatingJobIds.delete(jobId);
    }

    setState({
      updatingJobIds,
    });
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
  const updatedJobs = currentJobs.map((job) =>
    job.id === mutationResult.job.id ? mutationResult.job : job
  );

  if (!mutationResult.createdJobs?.length) {
    return updatedJobs;
  }

  const existingJobIds = new Set(updatedJobs.map((job) => job.id));
  const newJobs = mutationResult.createdJobs.filter((job) => !existingJobIds.has(job.id));

  return [...newJobs, ...updatedJobs];
}
