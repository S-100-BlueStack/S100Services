import { createSelectedAoiStore } from "../features/aoi/state/selectedAoiStore.js";
import { createJobFilterStore } from "../features/jobs/state/jobFilterStore.js";
import { JOB_STORE_CHANGE_TYPE, createJobStore } from "../features/jobs/state/jobStore.js";
import { createSelectedJobStore } from "../features/jobs/state/selectedJobStore.js";
import { createMapController } from "../features/map/core/mapController.js";
import { createAoiMapFilterStore } from "../features/map/state/aoiMapFilterStore.js";
import { createJobClusterSettingsStore } from "../features/map/state/jobClusterSettingsStore.js";
import { showErrorNotice, showSuccessNotice } from "../features/notices/services/noticeService.js";
import { createNoticeRegion } from "../features/notices/ui/noticeContainer.js";
import { createThemeStore } from "../features/theme/state/themeStore.js";
import { getRuntimeConfig } from "../shared/config/runtimeConfig.js";
import { createStartupController } from "./startup/createStartupController.js";
import { createStartupLoader } from "../shared/ui/startupLoader.js";
import { createJobsOverlay } from "./ui/createJobsOverlay.js";
import { createMapWorkspace } from "./ui/createMapWorkspace.js";
import { createNavbarController } from "./ui/createNavbarController.js";

export async function createApp(rootElement) {
  const runtimeConfig = getRuntimeConfig();
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  const jobFilterStore = createJobFilterStore();
  const jobStore = createJobStore();
  const aoiMapFilterStore = createAoiMapFilterStore();
  const jobClusterSettingsStore = createJobClusterSettingsStore();
  const themeStore = createThemeStore();
  const noticeRegion = createNoticeRegion();
  const startupLoader = createStartupLoader();
  const appEventAbortController = new AbortController();

  let jobsRefreshRequestId = 0;
  let handledJobChangeSequence = 0;
  let isDestroyed = false;
  let isStartupComplete = false;
  let isSelectedJobMapScopeActive = false;

  const navbar = await createNavbarController({
    jobFilterStore,
    aoiMapFilterStore,
    jobClusterSettingsStore,
    themeStore,
    onTestNotice() {
      showSuccessNotice({
        title: "Notice pipeline ready",
        message: "User-facing notices can now be triggered from services.",
      });
    },
  });

  const jobsPanel = createJobsOverlay({
    jobFilterStore,
    jobStore,
  });
  const workspace = createMapWorkspace();

  const mapController = createMapController({
    container: workspace.mapViewElement,
    statusElement: workspace.mapStatusElement,
    runtimeConfig,
    onError(error) {
      showErrorNoticeAfterStartup({
        title: "Map could not be loaded",
        message: error.message,
      });
    },
    onJobLayerError(error) {
      showErrorNoticeAfterStartup({
        title: "Job geometry could not be loaded",
        message: error.message,
      });
    },
    onAoiLayerError(error) {
      showErrorNoticeAfterStartup({
        title: "AOIs could not be loaded",
        message: error.message,
      });
    },
    getJobs() {
      return jobStore.getSnapshot().jobs;
    },
    onShowRelatedJobs(selectedAoi) {
      const normalizedSelectedAoi = selectedAoiStore.selectAoi(selectedAoi);

      isSelectedJobMapScopeActive = false;

      if (!normalizedSelectedAoi.aoiId) {
        showErrorNotice({
          title: "AOI selection failed",
          message: "The selected AOI does not expose a usable identifier.",
        });

        return;
      }

      selectedJobStore.clearSelection();
      jobsPanel.clearSelectedJob();
      mapController.clearJobHighlight();

      void mapController
        .applyAoiJobScope(normalizedSelectedAoi)
        .then((result) => {
          if (!result.ok) {
            showErrorNotice({
              title: "Related Jobs could not be shown on the map",
              message: result.error.message,
            });
          }
        })
        .catch((error) => {
          showErrorNotice({
            title: "Related Jobs could not be shown on the map",
            message: error.message,
          });
        });

      void mapController.highlightAoiById(normalizedSelectedAoi.aoiId).catch((error) => {
        mapController.clearAoiHighlight();

        showErrorNotice({
          title: "AOI highlight failed",
          message: error.message,
        });
      });

      jobsPanel.showJobsForAoi(normalizedSelectedAoi);
      setPanelOpen(jobsPanel.element, navbar.jobsButton, true);
    },
    onShowJobDetails(selectedJob) {
      const normalizedSelectedJob = selectedJobStore.selectJob(selectedJob);

      if (!normalizedSelectedJob.jobId) {
        showErrorNotice({
          title: "Job selection failed",
          message: "The selected Job does not expose a usable identifier.",
        });

        return;
      }

      isSelectedJobMapScopeActive = false;
      selectedAoiStore.clearSelection();
      mapController.clearAoiJobScope();
      jobsPanel.showJobDetails(normalizedSelectedJob);
      setPanelOpen(jobsPanel.element, navbar.jobsButton, true);
      applySelectedJobMapHighlights(normalizedSelectedJob);
    },
  });

  workspace.element.appendChild(jobsPanel.element);

  const shellElement = document.createElement("div");
  shellElement.className = "job-manager-app job-manager-app--startup-blocked";
  shellElement.inert = true;
  shellElement.setAttribute("aria-hidden", "true");
  shellElement.append(navbar.element, workspace.element, noticeRegion);

  rootElement.replaceChildren(shellElement, startupLoader.element);

  const startupController = createStartupController({
    startupLoader,
    mapController,
    jobStore,
  });

  const unsubscribeMapJobFilters = jobFilterStore.subscribe((snapshot) => {
    mapController.applyJobFilters(snapshot.filters);
  });

  const unsubscribeMapJobClusterSettings = jobClusterSettingsStore.subscribe((snapshot) => {
    mapController.applyJobClusterSettings(snapshot.settings);
  });

  const unsubscribeMapAoiFilters = aoiMapFilterStore.subscribe((snapshot) => {
    mapController.applyAoiMapFilters(snapshot.filters);
  });

  const unsubscribeJobStoreSync = jobStore.subscribe((snapshot) => {
    mapController.refreshAoiPopupContent();
    void syncMapAfterJobStoreChange(snapshot);
  });

  jobsPanel.element.addEventListener(
    "job-manager:aoi-filter-cleared",
    () => {
      isSelectedJobMapScopeActive = false;
      selectedAoiStore.clearSelection();
      mapController.clearAoiHighlight();
      mapController.clearAoiJobScope();
    },
    {
      signal: appEventAbortController.signal,
    }
  );

  jobsPanel.element.addEventListener(
    "job-manager:job-selection-cleared",
    () => {
      isSelectedJobMapScopeActive = false;
      selectedJobStore.clearSelection();
      mapController.clearJobHighlight();
      mapController.clearAoiHighlight();
      mapController.clearAoiJobScope();
    },
    {
      signal: appEventAbortController.signal,
    }
  );

  jobsPanel.element.addEventListener(
    "job-manager:job-map-focus-requested",
    (event) => {
      const normalizedSelectedJob = selectedJobStore.selectJob(event.detail?.job);

      if (!normalizedSelectedJob.jobId) {
        showErrorNotice({
          title: "Job map focus failed",
          message: "The selected Job does not expose a usable identifier.",
        });

        return;
      }

      isSelectedJobMapScopeActive = true;
      selectedAoiStore.clearSelection();

      void mapController
        .applySelectedJobMapScope(normalizedSelectedJob)
        .then((result) => {
          if (!result.ok) {
            showErrorNotice({
              title: "Job map focus failed",
              message: result.error.message,
            });
          }
        })
        .catch((error) => {
          showErrorNotice({
            title: "Job map focus failed",
            message: error.message,
          });
        });

      applySelectedJobMapHighlights(normalizedSelectedJob);
    },
    {
      signal: appEventAbortController.signal,
    }
  );

  jobsPanel.element.addEventListener(
    "job-manager:job-map-focus-cleared",
    () => {
      isSelectedJobMapScopeActive = false;
      selectedAoiStore.clearSelection();
      selectedJobStore.clearSelection();
      mapController.clearJobHighlight();
      mapController.clearAoiHighlight();
      mapController.clearAoiJobScope();
    },
    {
      signal: appEventAbortController.signal,
    }
  );

  jobsPanel.element.addEventListener(
    "job-manager:jobs-refreshed",
    (event) => {
      void refreshMapAfterJobsRefresh({
        jobs: event.detail?.jobs,
      });
    },
    {
      signal: appEventAbortController.signal,
    }
  );

  setPanelOpen(jobsPanel.element, navbar.jobsButton, false);

  navbar.jobsButton.addEventListener(
    "click",
    () => {
      const shouldOpen = jobsPanel.element.hidden;

      isSelectedJobMapScopeActive = false;
      selectedAoiStore.clearSelection();
      selectedJobStore.clearSelection();
      jobsPanel.clearSelectedJob();
      mapController.clearJobHighlight();
      mapController.clearAoiHighlight();
      mapController.clearAoiJobScope();

      if (shouldOpen) {
        jobsPanel.clearAoiFilter();
        jobsPanel.refreshJobs();
      } else {
        jobsPanel.hideCompletedJobs();
      }

      setPanelOpen(jobsPanel.element, navbar.jobsButton, shouldOpen);
    },
    {
      signal: appEventAbortController.signal,
    }
  );

  jobsPanel.closeButton.addEventListener(
    "click",
    () => {
      isSelectedJobMapScopeActive = false;
      selectedAoiStore.clearSelection();
      selectedJobStore.clearSelection();
      jobsPanel.clearSelectedJob();
      mapController.clearJobHighlight();
      mapController.clearAoiHighlight();
      mapController.clearAoiJobScope();
      jobsPanel.hideCompletedJobs();
      setPanelOpen(jobsPanel.element, navbar.jobsButton, false);
    },
    {
      signal: appEventAbortController.signal,
    }
  );

  void startupController.runStartup({
    onStartupBlocked() {
      isStartupComplete = false;
      blockShellForStartup(shellElement);
    },
    onStartupComplete() {
      isStartupComplete = true;
      releaseShellAfterStartup(shellElement);
    },
  });

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

    if (!isStartupComplete) {
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
    const refreshRequestId = jobsRefreshRequestId + 1;
    jobsRefreshRequestId = refreshRequestId;

    const result = await mapController.refreshJobData({
      jobs,
    });

    if (refreshRequestId !== jobsRefreshRequestId) {
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

      if (refreshRequestId !== jobsRefreshRequestId) {
        return;
      }

      if (!scopeResult.ok) {
        showErrorNotice({
          title: "Related Jobs could not be refreshed on the map",
          message: scopeResult.error.message,
        });
      }
    } catch (error) {
      if (refreshRequestId === jobsRefreshRequestId) {
        showErrorNotice({
          title: "Related Jobs could not be refreshed on the map",
          message: error.message,
        });
      }
    }

    try {
      await mapController.highlightAoiById(selectedAoi.aoiId);
    } catch (error) {
      if (refreshRequestId !== jobsRefreshRequestId) {
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
    if (isSelectedJobMapScopeActive) {
      try {
        const scopeResult = await mapController.applySelectedJobMapScope(selectedJob);

        if (refreshRequestId !== jobsRefreshRequestId) {
          return;
        }

        if (!scopeResult.ok) {
          showErrorNotice({
            title: "Job map focus could not be refreshed",
            message: scopeResult.error.message,
          });
        }
      } catch (error) {
        if (refreshRequestId === jobsRefreshRequestId) {
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
      if (refreshRequestId !== jobsRefreshRequestId) {
        return;
      }

      showErrorNotice({
        title: "Job highlight failed",
        message: error.message,
      });
    }

    if (refreshRequestId !== jobsRefreshRequestId) {
      return;
    }

    if (selectedJob.relatedAoiIds.length === 0) {
      mapController.clearAoiHighlight();
      return;
    }

    try {
      await mapController.highlightRelatedAoisForJob(selectedJob);
    } catch (error) {
      if (refreshRequestId !== jobsRefreshRequestId) {
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

  function applySelectedJobMapHighlights(selectedJob) {
    void mapController.highlightJob(selectedJob).catch((error) => {
      showErrorNotice({
        title: "Job highlight failed",
        message: error.message,
      });
    });

    if (selectedJob.relatedAoiIds.length > 0) {
      void mapController.highlightRelatedAoisForJob(selectedJob).catch((error) => {
        mapController.clearAoiHighlight();

        showErrorNotice({
          title: "Related AOIs could not be highlighted",
          message: error.message,
        });
      });

      return;
    }

    mapController.clearAoiHighlight();
  }

  function showErrorNoticeAfterStartup(options) {
    if (!isStartupComplete) {
      return;
    }

    showErrorNotice(options);
  }

  return {
    destroy() {
      isDestroyed = true;
      jobsRefreshRequestId += 1;
      startupController.destroy();
      appEventAbortController.abort();
      unsubscribeMapJobFilters();
      unsubscribeMapJobClusterSettings();
      unsubscribeMapAoiFilters();
      unsubscribeJobStoreSync();
      navbar.destroy();
      themeStore.destroy();
      jobsPanel.destroy();
      mapController.destroy();
      noticeRegion.destroy?.();
      startupLoader.destroy();
      rootElement.replaceChildren();
    },
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

function blockShellForStartup(shellElement) {
  shellElement.classList.add("job-manager-app--startup-blocked");
  shellElement.inert = true;
  shellElement.setAttribute("aria-hidden", "true");
}

function releaseShellAfterStartup(shellElement) {
  shellElement.classList.remove("job-manager-app--startup-blocked");
  shellElement.inert = false;
  shellElement.setAttribute("aria-hidden", "false");
}

function setPanelOpen(panelElement, triggerButton, isOpen) {
  if (!isOpen) {
    moveFocusOutOfPanel(panelElement, triggerButton);
  }

  panelElement.hidden = !isOpen;
  panelElement.inert = !isOpen;
  panelElement.setAttribute("aria-hidden", String(!isOpen));
  triggerButton.setAttribute("aria-expanded", String(isOpen));
}

function moveFocusOutOfPanel(panelElement, fallbackElement) {
  const activeElement = document.activeElement;

  if (!activeElement || !panelElement.contains(activeElement)) {
    return;
  }

  // Move focus before hiding the panel so browsers do not block aria-hidden on focused content.
  fallbackElement?.focus?.({
    preventScroll: true,
  });
}
