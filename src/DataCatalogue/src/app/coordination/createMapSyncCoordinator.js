import { JOB_STORE_CHANGE_TYPE } from "../../features/jobs/state/jobStore.js";
import { showErrorNotice as defaultShowErrorNotice } from "../../features/notices/services/noticeService.js";

export function createMapSyncCoordinator({
  mapController,
  selectedAoiStore,
  selectedJobStore,
  showErrorNotice = defaultShowErrorNotice,
  getIsStartupComplete = () => true,
  getIsSelectedJobMapScopeActive = () => false,
} = {}) {
  let refreshRequestSequence = 0;
  let handledJobChangeSequence = 0;

  async function refreshMapAfterJobsRefresh({ jobs } = {}) {
    await syncMapAfterJobsSnapshot({
      jobs,
      failureTitle: "Map refresh failed",
    });
  }

  async function syncMapAfterJobStoreChange(snapshot) {
    const lastChange = snapshot?.lastChange;

    if (!shouldSyncMapAfterJobStoreChange(lastChange)) {
      return;
    }

    handledJobChangeSequence = lastChange.sequence;

    if (!getIsStartupComplete()) {
      return;
    }

    await syncMapAfterJobsSnapshot({
      jobs: snapshot.jobs,
      failureTitle: "Map sync failed",
    });
  }

  function shouldSyncMapAfterJobStoreChange(lastChange) {
    return (
      lastChange?.type === JOB_STORE_CHANGE_TYPE.JOB_STATUS_UPDATED &&
      Number.isInteger(lastChange.sequence) &&
      lastChange.sequence > handledJobChangeSequence
    );
  }

  async function syncMapAfterJobsSnapshot({ jobs, failureTitle }) {
    const refreshRequestId = refreshRequestSequence + 1;
    refreshRequestSequence = refreshRequestId;

    const result = await mapController.refreshJobData({
      jobs,
    });

    if (refreshRequestId !== refreshRequestSequence) {
      return;
    }

    if (!result.ok) {
      showErrorNotice({
        title: failureTitle,
        message: result.error.message,
      });

      return;
    }

    const selectedAoi = selectedAoiStore.getSnapshot().selectedAoi;
    const selectedJob = getCurrentSelectedJobForMapSync(jobs);

    if (selectedAoi?.aoiId) {
      await refreshSelectedAoiMapState(selectedAoi, refreshRequestId);
      return;
    }

    if (selectedJob?.jobId) {
      await refreshSelectedJobMapState(selectedJob, refreshRequestId);
    }
  }

  async function refreshSelectedAoiMapState(selectedAoi, refreshRequestId) {
    try {
      const scopeResult = await mapController.applyAoiJobScope(selectedAoi);

      if (refreshRequestId !== refreshRequestSequence) {
        return;
      }

      if (!scopeResult.ok) {
        showErrorNotice({
          title: "Related Jobs could not be refreshed on the map",
          message: scopeResult.error.message,
        });
      }
    } catch (error) {
      if (refreshRequestId === refreshRequestSequence) {
        showErrorNotice({
          title: "Related Jobs could not be refreshed on the map",
          message: error.message,
        });
      }
    }

    try {
      await mapController.highlightAoiById(selectedAoi.aoiId);
    } catch (error) {
      if (refreshRequestId !== refreshRequestSequence) {
        return;
      }

      mapController.clearAoiHighlight();

      showErrorNotice({
        title: "AOI highlight failed",
        message: error.message,
      });
    }
  }

  async function refreshSelectedJobMapState(selectedJob, refreshRequestId) {
    if (getIsSelectedJobMapScopeActive()) {
      try {
        const scopeResult = await mapController.applySelectedJobMapScope(selectedJob);

        if (refreshRequestId !== refreshRequestSequence) {
          return;
        }

        if (!scopeResult.ok) {
          showErrorNotice({
            title: "Job map focus could not be refreshed",
            message: scopeResult.error.message,
          });
        }
      } catch (error) {
        if (refreshRequestId === refreshRequestSequence) {
          showErrorNotice({
            title: "Job map focus could not be refreshed",
            message: error.message,
          });
        }
      }
    }

    try {
      await mapController.highlightJob(selectedJob);
    } catch (error) {
      if (refreshRequestId !== refreshRequestSequence) {
        return;
      }

      showErrorNotice({
        title: "Job highlight failed",
        message: error.message,
      });
    }

    if (refreshRequestId !== refreshRequestSequence) {
      return;
    }

    if (selectedJob.relatedAoiIds.length === 0) {
      mapController.clearAoiHighlight();
      return;
    }

    try {
      await mapController.highlightRelatedAoisForJob(selectedJob);
    } catch (error) {
      if (refreshRequestId !== refreshRequestSequence) {
        return;
      }

      mapController.clearAoiHighlight();

      showErrorNotice({
        title: "Related AOIs could not be highlighted",
        message: error.message,
      });
    }
  }

  function getCurrentSelectedJobForMapSync(jobs) {
    const selectedJob = selectedJobStore.getSnapshot().selectedJob;

    if (!selectedJob?.jobId) {
      return null;
    }

    const currentJob = findJobById(jobs, selectedJob.jobId);

    if (!currentJob) {
      return selectedJob;
    }

    return selectedJobStore.selectJob(currentJob);
  }

  function cancelPendingRefreshes() {
    refreshRequestSequence += 1;
  }

  return {
    refreshMapAfterJobsRefresh,
    syncMapAfterJobStoreChange,
    cancelPendingRefreshes,
    destroy: cancelPendingRefreshes,
  };
}

function findJobById(jobs, jobId) {
  const normalizedJobId = normalizeOptionalString(jobId);

  if (!normalizedJobId || !Array.isArray(jobs)) {
    return null;
  }

  return (
    jobs.find((job) => normalizeOptionalString(job?.id ?? job?.jobId) === normalizedJobId) ?? null
  );
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
