import { createSelectedAoiStore } from "../features/aoi/state/selectedAoiStore.js";
import { createJobFilterStore } from "../features/jobs/state/jobFilterStore.js";
import { createSelectedJobStore } from "../features/jobs/state/selectedJobStore.js";
import { createMapController } from "../features/map/core/mapController.js";
import { createJobClusterSettingsStore } from "../features/map/state/jobClusterSettingsStore.js";
import { showErrorNotice, showSuccessNotice } from "../features/notices/services/noticeService.js";
import { createNoticeRegion } from "../features/notices/ui/noticeContainer.js";
import { getRuntimeConfig } from "../shared/config/runtimeConfig.js";
import { createJobsOverlay } from "./ui/createJobsOverlay.js";
import { createMapWorkspace } from "./ui/createMapWorkspace.js";
import { createNavbarController } from "./ui/createNavbarController.js";

export async function createApp(rootElement) {
  const runtimeConfig = getRuntimeConfig();
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  const jobFilterStore = createJobFilterStore();
  const jobClusterSettingsStore = createJobClusterSettingsStore();
  const noticeRegion = createNoticeRegion();
  const appEventAbortController = new AbortController();
  let jobsRefreshRequestId = 0;

  const navbar = await createNavbarController({
    jobFilterStore,
    jobClusterSettingsStore,
    onTestNotice() {
      showSuccessNotice({
        title: "Notice pipeline ready",
        message: "User-facing notices can now be triggered from services.",
      });
    },
  });

  const jobsPanel = createJobsOverlay({ jobFilterStore });
  const workspace = createMapWorkspace();

  const mapController = createMapController({
    container: workspace.mapViewElement,
    statusElement: workspace.mapStatusElement,
    runtimeConfig,
    onError(error) {
      showErrorNotice({
        title: "Map could not be loaded",
        message: error.message,
      });
    },
    onJobLayerError(error) {
      showErrorNotice({
        title: "Job geometry could not be loaded",
        message: error.message,
      });
    },
    onShowRelatedJobs(selectedAoi) {
      const normalizedSelectedAoi = selectedAoiStore.selectAoi(selectedAoi);

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

      selectedAoiStore.clearSelection();
      mapController.clearAoiJobScope();
      jobsPanel.showJobDetails(normalizedSelectedJob);
      setPanelOpen(jobsPanel.element, navbar.jobsButton, true);

      void mapController.highlightJob(normalizedSelectedJob).catch((error) => {
        showErrorNotice({
          title: "Job highlight failed",
          message: error.message,
        });
      });

      if (normalizedSelectedJob.relatedAoiIds.length > 0) {
        void mapController.highlightRelatedAoisForJob(normalizedSelectedJob).catch((error) => {
          mapController.clearAoiHighlight();

          showErrorNotice({
            title: "Related AOIs could not be highlighted",
            message: error.message,
          });
        });
      } else {
        mapController.clearAoiHighlight();
      }
    },
  });

  workspace.element.appendChild(jobsPanel.element);

  const shellElement = document.createElement("div");
  shellElement.className = "job-manager-app";
  shellElement.append(navbar.element, workspace.element, noticeRegion);

  rootElement.replaceChildren(shellElement);

  const unsubscribeMapJobFilters = jobFilterStore.subscribe((snapshot) => {
    mapController.applyJobFilters(snapshot.filters);
  });

  const unsubscribeMapJobClusterSettings = jobClusterSettingsStore.subscribe((snapshot) => {
    mapController.applyJobClusterSettings(snapshot.settings);
  });

  jobsPanel.element.addEventListener(
    "job-manager:aoi-filter-cleared",
    () => {
      selectedAoiStore.clearSelection();
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

  async function refreshMapAfterJobsRefresh({ jobs } = {}) {
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
        title: "Map refresh failed",
        message: result.error.message,
      });

      return;
    }

    const selectedAoi = selectedAoiStore.getSnapshot().selectedAoi;
    const selectedJob = selectedJobStore.getSnapshot().selectedJob;

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

  mapController.start();

  return {
    destroy() {
      jobsRefreshRequestId += 1;
      appEventAbortController.abort();
      unsubscribeMapJobFilters();
      unsubscribeMapJobClusterSettings();
      navbar.destroy();
      jobsPanel.destroy();
      mapController.destroy();
      noticeRegion.destroy?.();
      rootElement.replaceChildren();
    },
  };
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
