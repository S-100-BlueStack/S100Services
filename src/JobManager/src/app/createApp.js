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

  setPanelOpen(jobsPanel.element, navbar.jobsButton, true);

  navbar.jobsButton.addEventListener("click", () => {
    const shouldOpen = jobsPanel.element.hidden;

    selectedJobStore.clearSelection();
    jobsPanel.clearSelectedJob();
    mapController.clearJobHighlight();
    mapController.clearAoiHighlight();

    if (shouldOpen) {
      selectedAoiStore.clearSelection();
      jobsPanel.clearAoiFilter();
      jobsPanel.refreshJobs();
    } else {
      jobsPanel.hideCompletedJobs();
    }

    setPanelOpen(jobsPanel.element, navbar.jobsButton, shouldOpen);
  });

  jobsPanel.closeButton.addEventListener("click", () => {
    selectedJobStore.clearSelection();
    jobsPanel.clearSelectedJob();
    mapController.clearJobHighlight();
    mapController.clearAoiHighlight();
    jobsPanel.hideCompletedJobs();
    setPanelOpen(jobsPanel.element, navbar.jobsButton, false);
  });

  mapController.start();

  return {
    destroy() {
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
