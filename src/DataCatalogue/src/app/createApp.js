import { createCatalogueClient } from "../shared/api/catalogueClient.js";
import { createCatalogueService } from "../shared/api/catalogueService.js";
import { createLiveJobServiceAdapter } from "../features/jobs/services/liveJobServiceAdapter.js";
import { createJobService } from "../features/jobs/services/jobService.js";
import { createPipelineVisibility } from "../features/map/workspaces/createPipelineVisibility.js";
import { createBasemapSettings } from "../features/map/basemaps/basemapSettings.js";
import { createBasemapSelector } from "../features/map/basemaps/createBasemapSelector.js";
import { createPreferencesSettings } from "../features/preferences/state/createPreferencesSettings.js";
import { createPreferencesPanel } from "../features/preferences/ui/createPreferencesPanel.js";
import { countOpenJobsByWorkspace } from "../features/map/workspaces/workspaceJobColors.js";
import { createAssignmentWorkflow } from "../features/assignmentPage/createAssignmentWorkflow.js";
import { createWorkflowNavigation } from "./ui/createWorkflowNavigation.js";
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
import { createJobsPanelActions } from "./ui/createJobsPanelActions.js";
import { createMapWorkspace } from "./ui/createMapWorkspace.js";
import { createNavbarController } from "./ui/createNavbarController.js";

export async function createApp(rootElement) {
  const runtimeConfig = getRuntimeConfig();
  const live = runtimeConfig.sourceMode === "live";
  const preferences = createPreferencesSettings();
  const themeStore = createThemeStore({ storage: preferences.themeStorage });
  const basemapSettings = createBasemapSettings({
    apiKey: runtimeConfig.arcgisBasemapApiKey,
    preferences,
    themeMode: themeStore.getSnapshot().themeMode,
  });
  const unsubscribeThemeBasemap = themeStore.subscribe(({ themeMode }) => {
    basemapSettings.setThemeMode(themeMode);
  });
  const catalogue = live
    ? createCatalogueService(
        createCatalogueClient({
          baseUrl: runtimeConfig.catalogueApiBaseUrl,
          credentials: runtimeConfig.catalogueApiCredentials,
        })
      )
    : null;
  let pipelineVisibility = null;
  let hasLoadedJobCatalogue = false;
  const liveJobs = live
    ? createLiveJobServiceAdapter({
        catalogue,
        ensureWorkspaces: () => pipelineVisibility.ensureLoaded(),
      })
    : null;
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  const jobFilterStore = createJobFilterStore();
  const jobStore = createJobStore(live ? { service: createJobService({ adapter: liveJobs }) } : {});
  const aoiMapFilterStore = createAoiMapFilterStore();
  const jobClusterSettingsStore = createJobClusterSettingsStore();
  const noticeRegion = createNoticeRegion();
  const startupLoader = createStartupLoader();
  const appEventAbortController = new AbortController();

  let isStartupComplete = false;
  let isSelectedJobMapScopeActive = false;
  let mapSyncCoordinator = null;

  const navbar = await createNavbarController({
    sourceMode: runtimeConfig.sourceMode,
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

  const preferencesPanel = createPreferencesPanel({
    navbarElement: navbar.element,
    settings: preferences,
    themeStore,
    basemapSettings,
  });
  const jobsPanel = createJobsOverlay({
    sourceMode: runtimeConfig.sourceMode,
    jobFilterStore,
    jobStore,
  });
  const workspace = createMapWorkspace({ live });
  const basemapSelector = createBasemapSelector({
    container: workspace.basemapHost,
    settings: basemapSettings,
  });
  workspace.actionBar.prepend(navbar.jobsButton);
  navbar.jobsButton.hidden = false;

  const mapController = createMapController({
    container: workspace.mapViewElement,
    statusElement: workspace.mapStatusElement,
    runtimeConfig,
    catalogue,
    basemapSettings,
    onError(error) {
      showErrorNoticeAfterStartup({
        title: "Map could not be loaded",
        message: error.message,
      });
    },
    onWorkspaceCoverageError(message) {
      showErrorNoticeAfterStartup({ title: "Workspace geometry unavailable", message });
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

      cancelPendingMapRestores();
      isSelectedJobMapScopeActive = false;
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
      setJobsPanelOpen(true);
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

      cancelPendingMapRestores();
      isSelectedJobMapScopeActive = false;
      selectedAoiStore.clearSelection();
      mapController.clearAoiJobScope();
      jobsPanel.showJobDetails(normalizedSelectedJob);
      setJobsPanelOpen(true);
      applySelectedJobMapHighlights(normalizedSelectedJob);
    },
  });

  workspace.panelHost.appendChild(jobsPanel.element);

  const jobsWorkflowHost = document.createElement("div");
  jobsWorkflowHost.className = "dc-jobs-workflow-host";
  startupLoader.element.classList.add("dc-workflow-startup");
  jobsWorkflowHost.append(workspace.element, startupLoader.element);

  const shellElement = document.createElement("div");
  shellElement.className = `data-catalogue-app${live ? " data-catalogue-app--live" : ""}`;
  blockShellForStartup(workspace.element);
  // Live Jobs are available immediately, independently of map geometry loading.
  navbar.jobsButton.disabled = !live;
  navbar.filtersButton.disabled = true;
  shellElement.append(navbar.element, jobsWorkflowHost, noticeRegion);

  rootElement.replaceChildren(shellElement);
  const jobsPanelActions = createJobsPanelActions({
    isOpen: () => !jobsPanel.element.hidden,
    resetContext: resetJobsPanelContext,
    prepareOpen() {
      jobsPanel.clearAoiFilter();
      jobsPanel.refreshJobs();
    },
    prepareClose: () => jobsPanel.hideCompletedJobs(),
    setOpen: (isOpen) => setJobsPanelOpen(isOpen),
  });
  const workflowNavigation = createWorkflowNavigation({
    shellElement,
    jobsWorkflowHost,
    navbar,
    createPage: (options) =>
      createAssignmentWorkflow(runtimeConfig, catalogue, { ...options, basemapSettings }),
    onNavigationError(error) {
      showErrorNotice({
        title: "Package assignment could not be opened",
        message: error.message,
      });
    },
    onOpenJobs: jobsPanelActions.open,
    isJobsStartupComplete: () => live || isStartupComplete,
  });

  pipelineVisibility = live
    ? createPipelineVisibility({
        catalogue,
        container: workspace.pipelineContent,
        onChange(workspaces) {
          mapController.setVisibleWorkspaces(workspaces);
        },
        onWorkspacesLoaded(workspaces) {
          void mapController.setWorkspaceCatalog(workspaces, { reload: true, autoFocus: false });
          // Jobs belong to every Workspace, regardless of which Pipelines are shown on the map.
          resetJobsPanelContext();
          const wasLoaded = hasLoadedJobCatalogue;
          liveJobs.setWorkspaces(workspaces);
          hasLoadedJobCatalogue = true;
          // Only the first catalogue load can be joined by a pending Jobs read.
          // Later catalogue reloads must supersede any read using older scopes.
          if (wasLoaded || !jobStore.getSnapshot().isLoading) {
            void jobStore.loadJobs({ clear: true });
          }
        },
      })
    : null;

  const startupController = createStartupController({
    startupLoader,
    mapController,
    jobStore,
  });
  mapSyncCoordinator = createMapSyncCoordinator({
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
    if (live) {
      // During a new catalogue load, retain neutral coverage until the full Jobs list arrives.
      mapController.setWorkspaceJobCounts(
        snapshot.isLoading || snapshot.error ? null : countOpenJobsByWorkspace(snapshot.jobs)
      );
    }
    mapController.refreshAoiPopupContent();
    void mapSyncCoordinator.syncMapAfterJobStoreChange(snapshot);
  });

  jobsPanel.element.addEventListener(
    "data-catalogue:aoi-filter-cleared",
    () => {
      cancelPendingMapRestores();
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
    "data-catalogue:job-selection-cleared",
    () => {
      cancelPendingMapRestores();
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
    "data-catalogue:job-map-focus-requested",
    (event) => {
      const normalizedSelectedJob = selectedJobStore.selectJob(event.detail?.job);

      if (!normalizedSelectedJob.jobId) {
        showErrorNotice({
          title: "Job map focus failed",
          message: "The selected Job does not expose a usable identifier.",
        });

        return;
      }

      cancelPendingMapRestores();
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
    "data-catalogue:job-map-focus-cleared",
    () => {
      cancelPendingMapRestores();
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
    "data-catalogue:jobs-refreshed",
    (event) => {
      void mapSyncCoordinator.refreshMapAfterJobsRefresh({
        jobs: event.detail?.jobs,
      });
    },
    {
      signal: appEventAbortController.signal,
    }
  );

  setJobsPanelOpen(false);

  function setJobsPanelOpen(isOpen) {
    setPanelOpen(jobsPanel.element, navbar.jobsButton, isOpen);
    navbar.jobsButton.active = isOpen;
    workspace.setJobsVisible(isOpen);
  }

  function resetJobsPanelContext() {
    cancelPendingMapRestores();
    isSelectedJobMapScopeActive = false;
    selectedAoiStore.clearSelection();
    selectedJobStore.clearSelection();
    jobsPanel.clearSelectedJob();
    mapController.clearJobHighlight();
    mapController.clearAoiHighlight();
    mapController.clearAoiJobScope();
  }

  workspace.pipelineAction.addEventListener(
    "click",
    () => {
      if (!jobsPanel.element.hidden) {
        jobsPanelActions.toggle();
        workspace.setPipelinesPanelOpen(true);
      } else {
        workspace.togglePipelinesPanel();
      }
    },
    { signal: appEventAbortController.signal }
  );

  jobsPanel.resetStatusesButton?.addEventListener(
    "click",
    () => {
      liveJobs.resetStatuses();
      void jobStore.loadJobs({ clear: true });
    },
    { signal: appEventAbortController.signal }
  );

  navbar.jobsButton.addEventListener("click", () => jobsPanelActions.toggle(), {
    signal: appEventAbortController.signal,
  });

  jobsPanel.closeButton.addEventListener(
    "click",
    () => {
      cancelPendingMapRestores();
      isSelectedJobMapScopeActive = false;
      selectedAoiStore.clearSelection();
      selectedJobStore.clearSelection();
      jobsPanel.clearSelectedJob();
      mapController.closeJobPopup();
      mapController.clearJobHighlight();
      mapController.clearAoiHighlight();
      mapController.clearAoiJobScope();
      jobsPanel.hideCompletedJobs();
      setJobsPanelOpen(false);
    },
    {
      signal: appEventAbortController.signal,
    }
  );

  if (live) {
    // API list access must not depend on unverified geography or basemap availability.
    isStartupComplete = true;
    releaseShellAfterStartup(workspace.element);
    startupLoader.complete({ text: "Live catalogue list access ready." });
    workflowNavigation.syncJobsButtonState();
    navbar.filtersButton.disabled = false;
    void mapController.start({ requireAois: false, deferJobGeometry: true }).then((result) => {
      if (result?.ok) basemapSelector.setView(result.data.view);
    });
  } else
    void startupController.runStartup({
      onStartupBlocked() {
        isStartupComplete = false;
        blockShellForStartup(workspace.element);
        workflowNavigation.syncJobsButtonState();
        navbar.filtersButton.disabled = true;
      },
      onStartupComplete() {
        isStartupComplete = true;
        releaseShellAfterStartup(workspace.element);
        workflowNavigation.syncJobsButtonState();
        navbar.filtersButton.disabled = false;
        basemapSelector.setView(mapController.getView());
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

  function cancelPendingMapRestores() {
    // User-driven context transitions should win over async refresh restore work.
    mapSyncCoordinator?.cancelPendingRefreshes?.();
  }

  function showErrorNoticeAfterStartup(options) {
    if (!isStartupComplete) {
      return;
    }

    showErrorNotice(options);
  }

  return {
    destroy() {
      pipelineVisibility?.destroy();
      basemapSelector.destroy();
      preferencesPanel.destroy();
      unsubscribeThemeBasemap();
      basemapSettings.destroy();
      preferences.destroy();
      jobStore.destroy();
      workflowNavigation.destroy();
      startupController.destroy();
      mapSyncCoordinator?.destroy?.();
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
  shellElement.classList.add("data-catalogue-app--startup-blocked");
  shellElement.inert = true;
  shellElement.setAttribute("aria-hidden", "true");
}

function releaseShellAfterStartup(shellElement) {
  shellElement.classList.remove("data-catalogue-app--startup-blocked");
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
