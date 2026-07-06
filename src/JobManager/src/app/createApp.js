import { createSelectedAoiStore } from "../features/aoi/state/selectedAoiStore.js";
import { createJobFilterStore } from "../features/jobs/state/jobFilterStore.js";
import { createJobStore } from "../features/jobs/state/jobStore.js";
import { createSelectedJobStore } from "../features/jobs/state/selectedJobStore.js";
import { createMapController } from "../features/map/core/mapController.js";
import { createAoiMapFilterStore } from "../features/map/state/aoiMapFilterStore.js";
import { createJobClusterSettingsStore } from "../features/map/state/jobClusterSettingsStore.js";
import { showErrorNotice, showSuccessNotice } from "../features/notices/services/noticeService.js";
import { createNoticeRegion } from "../features/notices/ui/noticeContainer.js";
import { createThemeStore } from "../features/theme/state/themeStore.js";
import { getRuntimeConfig } from "../shared/config/runtimeConfig.js";
import { createStartupController } from "./startup/createStartupController.js";
import { createMapSyncCoordinator } from "./coordination/createMapSyncCoordinator.js";
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
  const mapSyncCoordinator = createMapSyncCoordinator({
    mapController,
    selectedAoiStore,
    selectedJobStore,
    showErrorNotice,
    getIsStartupComplete() {
      return isStartupComplete;
    },
    getIsSelectedJobMapScopeActive() {
      return isSelectedJobMapScopeActive;
    },
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
    void mapSyncCoordinator.syncMapAfterJobStoreChange(snapshot);
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
      mapController.closeJobPopup();
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
      mapController.closeJobPopup();
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
      void mapSyncCoordinator.refreshMapAfterJobsRefresh({
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
      mapController.closeJobPopup();
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
      startupController.destroy();
      mapSyncCoordinator.destroy();
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
