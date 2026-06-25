import { createSelectedAoiStore } from "../features/aoi/state/selectedAoiStore.js";
import { createJobFilterStore } from "../features/jobs/state/jobFilterStore.js";
import { createJobStore } from "../features/jobs/state/jobStore.js";
import { createSelectedJobStore } from "../features/jobs/state/selectedJobStore.js";
import { createMapController } from "../features/map/core/mapController.js";
import { createJobClusterSettingsStore } from "../features/map/state/jobClusterSettingsStore.js";
import { showErrorNotice, showSuccessNotice } from "../features/notices/services/noticeService.js";
import { createNoticeRegion } from "../features/notices/ui/noticeContainer.js";
import { createThemeStore } from "../features/theme/state/themeStore.js";
import { getRuntimeConfig } from "../shared/config/runtimeConfig.js";
import { runWithRetry } from "../shared/utils/retryRunner.js";
import { createStartupLoader } from "../shared/ui/startupLoader.js";
import { createJobsOverlay } from "./ui/createJobsOverlay.js";
import { createMapWorkspace } from "./ui/createMapWorkspace.js";
import { createNavbarController } from "./ui/createNavbarController.js";

const STARTUP_MAX_ATTEMPTS = 10;

export async function createApp(rootElement) {
  const runtimeConfig = getRuntimeConfig();
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  const jobFilterStore = createJobFilterStore();
  const jobStore = createJobStore();
  const jobClusterSettingsStore = createJobClusterSettingsStore();
  const themeStore = createThemeStore();
  const noticeRegion = createNoticeRegion();
  const startupLoader = createStartupLoader();
  const appEventAbortController = new AbortController();
  const startupAbortController = new AbortController();

  let jobsRefreshRequestId = 0;
  let startupRequestId = 0;
  let isDestroyed = false;
  let isStartupComplete = false;
  const startupState = createStartupState();

  const navbar = await createNavbarController({
    jobFilterStore,
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
  shellElement.className = "job-manager-app job-manager-app--startup-blocked";
  shellElement.inert = true;
  shellElement.setAttribute("aria-hidden", "true");
  shellElement.append(navbar.element, workspace.element, noticeRegion);

  rootElement.replaceChildren(shellElement, startupLoader.element);

  const unsubscribeMapJobFilters = jobFilterStore.subscribe((snapshot) => {
    mapController.applyJobFilters(snapshot.filters);
  });

  const unsubscribeMapJobClusterSettings = jobClusterSettingsStore.subscribe((snapshot) => {
    mapController.applyJobClusterSettings(snapshot.settings);
  });

  const unsubscribeAoiPopupJobState = jobStore.subscribe(() => {
    mapController.refreshAoiPopupContent();
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

  void runStartup();

  async function runStartup() {
    const currentStartupRequestId = startupRequestId + 1;
    startupRequestId = currentStartupRequestId;
    isStartupComplete = false;

    shellElement.classList.add("job-manager-app--startup-blocked");
    shellElement.inert = true;
    shellElement.setAttribute("aria-hidden", "true");

    startupLoader.startLoading(createStartupLoadingText(startupState));

    try {
      await runStartupStage({
        label: "map workspace",
        startupRequestId: currentStartupRequestId,
        task: () =>
          ensureStartupMapReady({
            startupRequestId: currentStartupRequestId,
          }),
      });

      await runStartupStage({
        label: "Jobs load",
        startupRequestId: currentStartupRequestId,
        task: () =>
          ensureStartupJobsReady({
            startupRequestId: currentStartupRequestId,
          }),
      });

      await runStartupStage({
        label: "Job map rendering",
        startupRequestId: currentStartupRequestId,
        task: () =>
          ensureStartupJobMapReady({
            startupRequestId: currentStartupRequestId,
          }),
      });

      throwIfStaleStartup(currentStartupRequestId);

      isStartupComplete = true;
      shellElement.classList.remove("job-manager-app--startup-blocked");
      shellElement.inert = false;
      shellElement.setAttribute("aria-hidden", "false");

      startupLoader.complete({
        text: "Job Manager ready.",
      });
    } catch (error) {
      if (isDestroyed || startupAbortController.signal.aborted) {
        return;
      }

      startupLoader.fail({
        text: "Job Manager could not be loaded.",
        message: error?.message || "Required startup data could not be loaded.",
        onRetry() {
          void runStartup();
        },
      });
    }
  }

  async function runStartupStage({ label, startupRequestId: expectedStartupRequestId, task }) {
    throwIfStaleStartup(expectedStartupRequestId);

    return runWithRetry(task, {
      maxRetries: STARTUP_MAX_ATTEMPTS,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      signal: startupAbortController.signal,
      onRetry({ attempt, delay, error }) {
        startupLoader.startRetryCountdown({
          attempt,
          totalAttempts: STARTUP_MAX_ATTEMPTS,
          delayMs: delay,
          error,
          label,
        });
      },
    });
  }

  async function ensureStartupMapReady({ startupRequestId: expectedStartupRequestId }) {
    throwIfStaleStartup(expectedStartupRequestId);

    if (startupState.mapReady) {
      startupLoader.markDataReceived({
        text: "Map workspace already loaded.",
        progress: 0.32,
      });

      return startupState.mapResult;
    }

    startupLoader.setText("Preparing map workspace...");
    startupLoader.setDetail("The map and AOI source are loading.");
    startupLoader.setProgress(0.1);

    const mapStartupResult = await mapController.start({
      requireAois: true,
      deferJobGeometry: true,
      suppressStatus: true,
    });

    throwIfStaleStartup(expectedStartupRequestId);

    if (!mapStartupResult.ok) {
      throw mapStartupResult.error || new Error("Map startup failed.");
    }

    startupState.mapReady = true;
    startupState.mapResult = mapStartupResult.data;

    startupLoader.markDataReceived({
      text: "Map workspace loaded.",
      progress: 0.32,
    });

    return startupState.mapResult;
  }

  async function ensureStartupJobsReady({ startupRequestId: expectedStartupRequestId }) {
    throwIfStaleStartup(expectedStartupRequestId);

    if (startupState.jobsReady) {
      startupLoader.markDataReceived({
        text: "Jobs already loaded.",
        progress: 0.58,
      });

      return startupState.jobs;
    }

    startupLoader.setText("Loading Jobs...");
    startupLoader.setDetail("The required Jobs list is loading from the mock backend.");
    startupLoader.setProgress(0.42);

    const jobsResult = await jobStore.loadJobs();

    throwIfStaleStartup(expectedStartupRequestId);

    if (!jobsResult.ok) {
      throw jobsResult.error;
    }

    const jobs = normalizeStartupJobs(jobsResult.data?.jobs);

    startupState.jobsReady = true;
    startupState.jobs = jobs;
    startupState.jobMapReady = false;

    startupLoader.markDataReceived({
      text: "Jobs loaded.",
      progress: 0.58,
    });

    return startupState.jobs;
  }

  async function ensureStartupJobMapReady({ startupRequestId: expectedStartupRequestId }) {
    throwIfStaleStartup(expectedStartupRequestId);

    if (startupState.jobMapReady) {
      startupLoader.setText("Job map layers already rendered.");
      startupLoader.setDetail("");
      startupLoader.setProgress(0.94);

      return {
        jobs: startupState.jobs,
        map: startupState.mapResult,
      };
    }

    startupLoader.startRendering({
      text: "Rendering Jobs on the map...",
      progress: 0.68,
    });

    const jobMapResult = await mapController.refreshJobData({
      jobs: startupState.jobs,
    });

    throwIfStaleStartup(expectedStartupRequestId);

    if (!jobMapResult.ok) {
      throw jobMapResult.error || new Error("Job map layers could not be loaded.");
    }

    startupState.jobMapReady = true;

    startupLoader.setText("Finalizing map workspace...");
    startupLoader.setDetail("");
    startupLoader.setProgress(0.94);

    await waitForNextPaint();

    return {
      jobs: startupState.jobs,
      map: startupState.mapResult,
    };
  }

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

  function showErrorNoticeAfterStartup(options) {
    if (!isStartupComplete) {
      return;
    }

    showErrorNotice(options);
  }

  function throwIfStaleStartup(expectedStartupRequestId) {
    if (isDestroyed || startupAbortController.signal.aborted) {
      throw new Error("Operation aborted");
    }

    if (expectedStartupRequestId !== startupRequestId) {
      throw new Error("Startup attempt was replaced.");
    }
  }

  return {
    destroy() {
      isDestroyed = true;
      startupRequestId += 1;
      jobsRefreshRequestId += 1;
      startupAbortController.abort();
      appEventAbortController.abort();
      unsubscribeMapJobFilters();
      unsubscribeMapJobClusterSettings();
      unsubscribeAoiPopupJobState();
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

function normalizeStartupJobs(jobs) {
  if (!Array.isArray(jobs)) {
    throw new Error("Jobs loader returned an invalid result.");
  }

  return jobs;
}

function createStartupState() {
  return {
    mapReady: false,
    mapResult: null,
    jobsReady: false,
    jobs: [],
    jobMapReady: false,
  };
}

function createStartupLoadingText(startupState) {
  if (!startupState.mapReady) {
    return "Preparing map workspace...";
  }

  if (!startupState.jobsReady) {
    return "Loading Jobs...";
  }

  if (!startupState.jobMapReady) {
    return "Rendering Jobs on the map...";
  }

  return "Starting Job Manager...";
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
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
