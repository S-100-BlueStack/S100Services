import { createPackageCommentAvailability } from "../../features/jobs/services/createPackageCommentAvailability.js";
import { createPackageCommentViewer } from "../../features/jobs/ui/createPackageCommentViewer.js";
import { createJobList } from "../../features/jobs/ui/jobList.js";
import { createPackageInformationPanel } from "../../features/jobs/ui/createPackageInformationPanel.js";
import { createPackageScopeControls } from "../../features/jobs/ui/createPackageScopeControls.js";
import { JOB_STORE_CHANGE_TYPE } from "../../features/jobs/state/jobStore.js";

const LIVE_PACKAGE_PANEL_REUSE_MS = 60_000;

export function createJobsOverlay({
  jobFilterStore,
  jobStore,
  sourceMode = "mock",
  readPackageHistory,
  readPackageHistoryProfile,
  readCommentAvailability,
  readBindingComments,
  onScopeChange = () => {},
  now = () => Date.now(),
} = {}) {
  const jobList = createJobList({
    jobFilterStore,
    store: jobStore,
    sourceMode,
    readPackageHistory,
    readPackageHistoryProfile,
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
  titleElement.textContent = "Packages";

  titleGroupElement.append(titleElement);

  const headerActionsElement = document.createElement("div");
  headerActionsElement.className = "data-catalogue-overlay-panel__header-actions";

  const backButton = document.createElement("calcite-action");
  backButton.className = "data-catalogue-overlay-panel__back";
  backButton.icon = "arrow-left";
  backButton.text = "Back to Packages";
  backButton.title = "Back to Packages";
  backButton.hidden = true;
  backButton.setAttribute("aria-hidden", "true");
  backButton.addEventListener("click", () => {
    jobList.showJobListFromDetails();
  });

  const closeButton = document.createElement("calcite-action");
  closeButton.className = "data-catalogue-overlay-panel__close";
  closeButton.icon = "x";
  closeButton.text = "Close Packages panel";
  closeButton.title = "Close Packages panel";

  // Keep the list-only action mounted so normal list rerenders preserve keyboard focus.
  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.hidden = false;
  refreshButton.className = "job-list__refresh-button";
  refreshButton.title = "Refresh Packages";
  refreshButton.setAttribute("aria-label", "Refresh Packages");
  const icon = document.createElement("calcite-icon");
  icon.icon = "refresh";
  icon.scale = "s";
  icon.setAttribute("aria-hidden", "true");
  refreshButton.append(icon);
  refreshButton.addEventListener("click", () => {
    if (!refreshButton.hidden) void jobList.refreshJobs({ manual: true });
  });
  headerActionsElement.append(refreshButton);
  const informationButton = sourceMode === "live" ? document.createElement("calcite-action") : null;
  const packageInformation = informationButton
    ? createPackageInformationPanel({
        onRetry: () => void jobList.refreshJobs({ manual: true }),
        onVisibilityChange({ available, open }) {
          if (!available && document.activeElement === informationButton) {
            jobList.element.focus({ preventScroll: true });
          }
          informationButton.hidden = !available;
          informationButton.active = open;
          informationButton.text = open ? "Hide Package information" : "Show Package information";
          informationButton.title = informationButton.text;
          informationButton.setAttribute("aria-expanded", String(open));
        },
        restoreFocus({ available }) {
          (available ? informationButton : jobList.element).focus({ preventScroll: true });
        },
      })
    : null;
  if (informationButton) {
    informationButton.className = "data-catalogue-overlay-panel__information";
    informationButton.icon = "information";
    informationButton.hidden = true;
    informationButton.text = "Show Package information";
    informationButton.title = informationButton.text;
    informationButton.setAttribute("aria-controls", packageInformation.element.id);
    informationButton.setAttribute("aria-expanded", "false");
    informationButton.addEventListener("click", () => packageInformation.toggle());
    headerActionsElement.append(informationButton);
  }
  headerActionsElement.append(backButton, closeButton);
  headerElement.append(titleGroupElement, headerActionsElement);
  const scopeControls =
    sourceMode === "live"
      ? createPackageScopeControls({
          onChange(scope) {
            jobList.setPackageScope(scope);
            onScopeChange(scope);
          },
        })
      : null;
  panelElement.append(headerElement);
  if (scopeControls) panelElement.append(scopeControls.element);
  const commentAvailability =
    sourceMode === "live" && readCommentAvailability && readBindingComments
      ? createPackageCommentAvailability({
          read: readCommentAvailability,
          onChange: () => commentViewer.syncButtons(),
        })
      : null;
  const commentViewer = commentAvailability
    ? createPackageCommentViewer({
        listElement: jobList.element,
        panelElement,
        headerElement,
        availability: commentAvailability,
        read: readBindingComments,
        readProfile: readPackageHistoryProfile,
      })
    : null;
  if (commentViewer) {
    jobList.setCommentViewer(commentViewer);
  }
  panelElement.append(jobList.element);
  if (commentViewer) panelElement.append(commentViewer.element);

  let panelOpen = false;
  let mainMapActive = true;
  let waitingForPanelOpen = false;
  let detailsMode = false;
  let lastJobsState = null;
  function syncComments() {
    if (!commentAvailability || !lastJobsState) return;
    const state = lastJobsState;
    const visible = panelOpen && mainMapActive && !waitingForPanelOpen && !detailsMode;
    if (!visible) commentViewer.close();
    if (!visible || state.isLoading) {
      commentAvailability.setContext({ visible, busy: state.isLoading });
    }
    if (state.lastChange?.type === JOB_STORE_CHANGE_TYPE.JOBS_LOADED && !state.isLoading) {
      commentAvailability.acceptJobs(state.lastChange.sequence, state.jobs);
    }
    if (visible && !state.isLoading) {
      commentAvailability.setContext({ visible, busy: false });
    }
    commentViewer.syncButtons();
  }

  updateStickyHeaderHeight(panelElement, headerElement);

  const headerResizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          updateStickyHeaderHeight(panelElement, headerElement);
        })
      : null;

  headerResizeObserver?.observe(headerElement);

  const unsubscribeLoading = jobStore?.subscribe?.((state) => {
    if (
      scopeControls &&
      !state.isLoading &&
      !state.error &&
      (state.lastChange?.type === JOB_STORE_CHANGE_TYPE.JOBS_LOADED ||
        state.lastChange?.type === JOB_STORE_CHANGE_TYPE.JOB_STATUS_UPDATED)
    ) {
      scopeControls.setJobs(state.jobs);
    }
    lastJobsState = state;
    syncComments();
    refreshButton.disabled = state.isLoading;
    const label = state.isLoading ? "Refreshing Packages" : "Refresh Packages";
    refreshButton.title = label;
    refreshButton.setAttribute("aria-label", label);
  });

  jobList.element.addEventListener("data-catalogue:job-details-mode-changed", (event) => {
    const isDetailsMode = Boolean(event.detail?.isDetailsMode);

    if (detailsMode !== isDetailsMode) {
      detailsMode = isDetailsMode;
      syncComments();
    }
    if (scopeControls) {
      scopeControls.element.hidden = isDetailsMode;
      scopeControls.element.inert = isDetailsMode;
    }
    if (isDetailsMode && document.activeElement === refreshButton) {
      jobList.element.focus({ preventScroll: true });
    }
    refreshButton.hidden = isDetailsMode;
    if (packageInformation && !isDetailsMode && document.activeElement === backButton) {
      jobList.element.focus({ preventScroll: true });
    }
    backButton.hidden = !isDetailsMode;
    backButton.setAttribute("aria-hidden", String(!isDetailsMode));
    packageInformation?.update({
      selectedJobId: isDetailsMode ? event.detail.selectedJobId : null,
      openInformation: event.detail?.openInformation,
      snapshot: jobStore?.getSnapshot?.(),
    });
    updateStickyHeaderHeight(panelElement, headerElement);
  });

  return {
    element: panelElement,
    packageInformationElement: packageInformation?.element ?? null,
    closeButton,
    refreshButton,
    setPipelineCatalogue(groups) {
      scopeControls?.setCatalogue(groups);
      commentViewer?.setPipelineCatalogue(groups);
    },
    setPanelOpen(open) {
      panelOpen = open;
      waitingForPanelOpen = false;
      syncComments();
    },
    setMainMapActive(active, { openJobs = false } = {}) {
      mainMapActive = active;
      waitingForPanelOpen = active && openJobs;
      syncComments();
    },
    invalidateComments(binding) {
      commentAvailability?.invalidate(binding);
    },
    getWorkScope() {
      return scopeControls?.getScope() ?? null;
    },
    refreshJobs({ onPanelOpen = false, afterAssignment = false } = {}) {
      if (onPanelOpen && sourceMode === "live") {
        const snapshot = jobStore.getSnapshot();
        const loadedAt = snapshot.lastSuccessfulLoadAt;
        const age = now() - loadedAt;
        // Joining the current read avoids replacing a request that already owns this load.
        if (snapshot.isLoading) return Promise.resolve({ ok: false, pending: true });
        // Only a recent successful read can be reused; manual Refresh bypasses this policy.
        if (
          !snapshot.error &&
          !jobStore.hasPendingMembershipRefresh() &&
          Number.isFinite(loadedAt) &&
          age >= 0 &&
          age < LIVE_PACKAGE_PANEL_REUSE_MS
        ) {
          return Promise.resolve({ ok: true, reused: true });
        }
      }
      return jobList.refreshJobs({ afterAssignment });
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
      unsubscribeLoading?.();
      scopeControls?.destroy();
      packageInformation?.destroy();
      commentAvailability?.destroy();
      commentViewer?.destroy();
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
