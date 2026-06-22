import { createJobList } from "../../features/jobs/ui/jobList.js";

export function createJobsOverlay({ jobFilterStore } = {}) {
  const jobList = createJobList({ jobFilterStore });
  const panelElement = document.createElement("aside");
  panelElement.id = "job-manager-jobs-panel";
  panelElement.className = "job-manager-overlay-panel job-manager-jobs-overlay";
  panelElement.setAttribute("aria-labelledby", "job-manager-jobs-title");

  const headerElement = document.createElement("div");
  headerElement.className = "job-manager-overlay-panel__header";

  const titleGroupElement = document.createElement("div");
  titleGroupElement.className = "job-manager-overlay-panel__title-group";

  const titleElement = document.createElement("h2");
  titleElement.id = "job-manager-jobs-title";
  titleElement.className = "job-manager-overlay-panel__title";
  titleElement.textContent = "Jobs";

  const subtitleElement = document.createElement("p");
  subtitleElement.className = "job-manager-overlay-panel__subtitle";
  subtitleElement.textContent = "Mock backend";

  titleGroupElement.append(titleElement, subtitleElement);

  const closeButton = document.createElement("calcite-action");
  closeButton.className = "job-manager-overlay-panel__close";
  closeButton.icon = "x";
  closeButton.text = "Close Jobs panel";
  closeButton.title = "Close Jobs panel";

  headerElement.append(titleGroupElement, closeButton);
  panelElement.append(headerElement, jobList.element);

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
      jobList.destroy();
    },
  };
}
