import { createJobList } from "../../features/jobs/ui/jobList.js";

export function createJobsOverlay({ jobFilterStore, jobStore } = {}) {
  const jobList = createJobList({
    jobFilterStore,
    store: jobStore,
  });
  const panelElement = document.createElement("aside");
  panelElement.id = "data-catalogue-jobs-panel";
  panelElement.className = "data-catalogue-overlay-panel data-catalogue-jobs-overlay";
  panelElement.setAttribute("aria-labelledby", "data-catalogue-jobs-title");

  const headerElement = document.createElement("div");
  headerElement.className = "data-catalogue-overlay-panel__header";

  const titleGroupElement = document.createElement("div");
  titleGroupElement.className = "data-catalogue-overlay-panel__title-group";

  const titleElement = document.createElement("h2");
  titleElement.id = "data-catalogue-jobs-title";
  titleElement.className = "data-catalogue-overlay-panel__title";
  titleElement.textContent = "Jobs";

  const subtitleElement = document.createElement("p");
  subtitleElement.className = "data-catalogue-overlay-panel__subtitle";
  subtitleElement.textContent = "Mock backend";

  titleGroupElement.append(titleElement, subtitleElement);

  const headerActionsElement = document.createElement("div");
  headerActionsElement.className = "data-catalogue-overlay-panel__header-actions";

  const backButton = document.createElement("calcite-action");
  backButton.className = "data-catalogue-overlay-panel__back";
  backButton.icon = "arrow-left";
  backButton.text = "Back to Jobs";
  backButton.title = "Back to Jobs";
  backButton.hidden = true;
  backButton.setAttribute("aria-hidden", "true");
  backButton.addEventListener("click", () => {
    jobList.showJobListFromDetails();
  });

  const closeButton = document.createElement("calcite-action");
  closeButton.className = "data-catalogue-overlay-panel__close";
  closeButton.icon = "x";
  closeButton.text = "Close Jobs panel";
  closeButton.title = "Close Jobs panel";

  headerActionsElement.append(backButton, closeButton);
  headerElement.append(titleGroupElement, headerActionsElement);
  panelElement.append(headerElement, jobList.element);

  updateStickyHeaderHeight(panelElement, headerElement);

  const headerResizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          updateStickyHeaderHeight(panelElement, headerElement);
        })
      : null;

  headerResizeObserver?.observe(headerElement);

  jobList.element.addEventListener("data-catalogue:job-details-mode-changed", (event) => {
    const isDetailsMode = Boolean(event.detail?.isDetailsMode);

    backButton.hidden = !isDetailsMode;
    backButton.setAttribute("aria-hidden", String(!isDetailsMode));
    updateStickyHeaderHeight(panelElement, headerElement);
  });

  return {
    element: panelElement,
    closeButton,
    refreshJobs() {
      return jobList.refreshJobs();
    },
    showJobsForAoi(selectedAoi) {
      return jobList.showJobsForAoi(selectedAoi);
    },
    showJobDetails(selectedJob) {
      return jobList.showJobDetails(selectedJob);
    },
    clearSelectedJob() {
      jobList.clearSelectedJob();
    },
    clearAoiFilter() {
      jobList.clearAoiFilter();
    },
    hideCompletedJobs() {
      jobList.hideCompletedJobs();
    },
    destroy() {
      headerResizeObserver?.disconnect();
      jobList.destroy();
    },
  };
}

function updateStickyHeaderHeight(panelElement, headerElement) {
  const headerHeight = headerElement?.offsetHeight;

  if (!Number.isFinite(headerHeight) || headerHeight <= 0) {
    return;
  }

  panelElement.style.setProperty("--dc-jobs-panel-header-height", `${headerHeight}px`);
}
