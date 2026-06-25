import {
  filterJobs,
  getActiveJobFilterSummary,
  hasActiveJobFilters,
  shouldRevealDoneJobsForFilters,
} from "../domain/jobFilters.js";
import {
  showErrorNotice,
  showInfoNotice,
  showSuccessNotice,
} from "../../notices/services/noticeService.js";
import { getJobsForAoiFromJobs } from "../../relations/services/relationService.js";
import { JOB_STATUS, JOB_STATUS_OPTIONS } from "../domain/jobStatus.js";
import { createJobStore } from "../state/jobStore.js";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
});

export function createJobList({ jobFilterStore } = {}) {
  const store = createJobStore();
  const rootElement = document.createElement("div");
  rootElement.className = "job-list";

  let currentState = store.getSnapshot();
  let jobFilters = jobFilterStore?.getSnapshot?.().filters ?? null;
  let aoiFilter = null;
  let selectedJobId = "";
  const expandedJobIds = new Set();
  const visibleDoneJobIds = new Set();
  const pendingMutationJobIds = new Set();

  async function runJobsRefresh({ source = "manual", showSuccessNoticeOnSuccess = false } = {}) {
    const result = await loadJobs(store, visibleDoneJobIds, {
      showErrorNoticeOnFailure: false,
    });

    if (!result.ok) {
      showErrorNotice({
        title: source === "manual" ? "Refresh failed" : "Jobs could not be loaded",
        message: result.error.message,
      });

      return result;
    }

    if (showSuccessNoticeOnSuccess) {
      showSuccessNotice({
        title: "Jobs refreshed",
        message: "The mock Jobs list has been refreshed.",
      });
    }

    rootElement.dispatchEvent(
      createJobsRefreshedEvent({
        source,
        jobs: result.data.jobs,
      })
    );

    return result;
  }

  const clearAoiFilter = () => {
    const hadAoiFilter = Boolean(aoiFilter);

    aoiFilter = null;
    expandedJobIds.clear();
    render();

    if (hadAoiFilter) {
      rootElement.dispatchEvent(createAoiFilterClearedEvent());
    }
  };

  const clearSelectedJob = () => {
    if (!selectedJobId) {
      return;
    }

    selectedJobId = "";
    render();
  };

  const clearJobFilters = () => {
    jobFilterStore?.clearFilters?.();
  };

  const render = () => {
    renderJobList({
      rootElement,
      state: currentState,
      store,
      jobFilters,
      aoiFilter,
      selectedJobId,
      expandedJobIds,
      visibleDoneJobIds,
      pendingMutationJobIds,
      clearAoiFilter,
      clearJobFilters,
      runJobsRefresh,
      render,
    });
  };

  const unsubscribeJobs = store.subscribe((state) => {
    currentState = state;
    makeSelectedDoneJobVisible(visibleDoneJobIds, state.jobs, selectedJobId);
    removeInvisibleExpandedJobs(
      expandedJobIds,
      getFilteredScopedJobs(state.jobs, aoiFilter, jobFilters),
      visibleDoneJobIds,
      jobFilters
    );
    removeMissingVisibleDoneJobs(visibleDoneJobIds, state.jobs);
    render();
  });

  const unsubscribeFilters =
    jobFilterStore?.subscribe?.((snapshot) => {
      jobFilters = snapshot.filters;
      removeInvisibleExpandedJobs(
        expandedJobIds,
        getFilteredScopedJobs(currentState.jobs, aoiFilter, jobFilters),
        visibleDoneJobIds,
        jobFilters
      );
      render();
    }) ?? (() => {});

  loadJobs(store, visibleDoneJobIds);

  return {
    element: rootElement,
    refreshJobs() {
      return runJobsRefresh({
        source: "panel-open",
      });
    },
    showJobsForAoi(selectedAoi) {
      selectedJobId = "";
      aoiFilter = normalizeAoiFilter(selectedAoi);
      expandedJobIds.clear();

      if (currentState.jobs.length === 0 && !currentState.isLoading) {
        return loadJobs(store, visibleDoneJobIds);
      }

      render();

      return Promise.resolve({
        ok: true,
      });
    },
    async showJobDetails(selectedJob) {
      const normalizedSelectedJob = normalizeSelectedJob(selectedJob);

      if (!normalizedSelectedJob.jobId) {
        return {
          ok: false,
        };
      }

      selectedJobId = normalizedSelectedJob.jobId;
      aoiFilter = null;
      expandedJobIds.add(selectedJobId);

      if (currentState.jobs.length === 0 && !currentState.isLoading) {
        const result = await loadJobs(store, visibleDoneJobIds);

        makeSelectedDoneJobVisible(visibleDoneJobIds, currentState.jobs, selectedJobId);
        expandedJobIds.add(selectedJobId);
        render();
        focusJobCard(rootElement, selectedJobId);

        return result;
      }

      makeSelectedDoneJobVisible(visibleDoneJobIds, currentState.jobs, selectedJobId);
      render();
      focusJobCard(rootElement, selectedJobId);

      return Promise.resolve({
        ok: true,
      });
    },
    clearAoiFilter,
    clearSelectedJob,
    hideCompletedJobs() {
      visibleDoneJobIds.clear();
      makeSelectedDoneJobVisible(visibleDoneJobIds, currentState.jobs, selectedJobId);
      removeInvisibleExpandedJobs(
        expandedJobIds,
        getFilteredScopedJobs(currentState.jobs, aoiFilter, jobFilters),
        visibleDoneJobIds,
        jobFilters
      );
      render();
    },
    destroy() {
      unsubscribeJobs();
      unsubscribeFilters();
      rootElement.replaceChildren();
    },
  };
}

async function loadJobs(store, visibleDoneJobIds, { showErrorNoticeOnFailure = true } = {}) {
  visibleDoneJobIds.clear();

  const result = await store.loadJobs();

  if (!result.ok && showErrorNoticeOnFailure) {
    showErrorNotice({
      title: "Jobs could not be loaded",
      message: result.error.message,
    });
  }

  return result;
}

function renderJobList({
  rootElement,
  state,
  store,
  jobFilters,
  aoiFilter,
  selectedJobId,
  expandedJobIds,
  visibleDoneJobIds,
  pendingMutationJobIds,
  clearAoiFilter,
  clearJobFilters,
  runJobsRefresh,
  render,
}) {
  const scopedJobs = getScopedJobs(state.jobs, aoiFilter);
  const filteredScopedJobs = filterJobs(scopedJobs, jobFilters);
  const visibleJobs = getVisibleJobs(filteredScopedJobs, visibleDoneJobIds, jobFilters);
  const hiddenDoneCount = getHiddenDoneCount(filteredScopedJobs, visibleDoneJobIds, jobFilters);
  const contentElements = [];

  if (aoiFilter) {
    contentElements.push(createAoiFilterScope({ aoiFilter, clearAoiFilter }));
  }

  if (hasActiveJobFilters(jobFilters)) {
    contentElements.push(createJobFilterScope({ jobFilters, clearJobFilters }));
  }

  if (state.isLoading && state.jobs.length === 0) {
    rootElement.replaceChildren(...contentElements, createLoadingState());
    return;
  }

  if (state.error && state.jobs.length === 0) {
    rootElement.replaceChildren(
      ...contentElements,
      createErrorState({
        title: "Jobs could not be loaded",
        message: state.error.message,
        isLoading: state.isLoading,
        onRetry() {
          void runJobsRefresh({
            source: "retry",
          });
        },
      })
    );
    return;
  }

  const toolbarElement = createListToolbar({
    state,
    visibleJobs,
    hiddenDoneCount,
    jobFilters,
    expandedJobIds,
    visibleDoneJobIds,
    store,
    runJobsRefresh,
    render,
  });

  contentElements.push(toolbarElement);

  if (state.error) {
    contentElements.push(
      createInlineErrorState({
        title: "Latest Jobs refresh failed",
        message: state.error.message,
        isLoading: state.isLoading,
        onRetry() {
          void runJobsRefresh({
            source: "retry",
            showSuccessNoticeOnSuccess: true,
          });
        },
      })
    );
  }

  if (visibleJobs.length === 0) {
    contentElements.push(createEmptyState({ hiddenDoneCount, aoiFilter, jobFilters }));
    rootElement.replaceChildren(...contentElements);
    return;
  }

  const listElement = document.createElement("div");
  listElement.className = "job-list__items";

  for (const job of visibleJobs) {
    listElement.appendChild(
      createJobCard({
        job,
        selectedJobId,
        store,
        expandedJobIds,
        visibleDoneJobIds,
        pendingMutationJobIds,
        render,
      })
    );
  }

  contentElements.push(listElement);
  rootElement.replaceChildren(...contentElements);
}

function getFilteredScopedJobs(jobs, aoiFilter, jobFilters) {
  return filterJobs(getScopedJobs(jobs, aoiFilter), jobFilters);
}

function getScopedJobs(jobs, aoiFilter) {
  if (!aoiFilter) {
    return jobs;
  }

  if (!aoiFilter.aoiId) {
    return [];
  }

  return getJobsForAoiFromJobs({
    aoiId: aoiFilter.aoiId,
    jobs,
  });
}

function getVisibleJobs(jobs, visibleDoneJobIds, jobFilters) {
  const revealDoneJobs = shouldRevealDoneJobsForFilters(jobFilters);

  return jobs.filter(
    (job) => revealDoneJobs || job.status !== JOB_STATUS.DONE || visibleDoneJobIds.has(job.id)
  );
}

function getHiddenDoneCount(jobs, visibleDoneJobIds, jobFilters) {
  if (shouldRevealDoneJobsForFilters(jobFilters)) {
    return 0;
  }

  return jobs.filter((job) => job.status === JOB_STATUS.DONE && !visibleDoneJobIds.has(job.id))
    .length;
}

function makeSelectedDoneJobVisible(visibleDoneJobIds, jobs, selectedJobId) {
  if (!selectedJobId) {
    return;
  }

  const selectedJob = jobs.find((job) => job.id === selectedJobId);

  if (selectedJob?.status === JOB_STATUS.DONE) {
    visibleDoneJobIds.add(selectedJobId);
  }
}

function removeInvisibleExpandedJobs(expandedJobIds, jobs, visibleDoneJobIds, jobFilters) {
  const visibleJobIds = new Set(
    getVisibleJobs(jobs, visibleDoneJobIds, jobFilters).map((job) => job.id)
  );

  for (const jobId of expandedJobIds) {
    if (!visibleJobIds.has(jobId)) {
      expandedJobIds.delete(jobId);
    }
  }
}

function removeMissingVisibleDoneJobs(visibleDoneJobIds, jobs) {
  const jobIds = new Set(jobs.map((job) => job.id));

  for (const jobId of visibleDoneJobIds) {
    if (!jobIds.has(jobId)) {
      visibleDoneJobIds.delete(jobId);
    }
  }
}

function createAoiFilterScope({ aoiFilter, clearAoiFilter }) {
  const scopeElement = document.createElement("div");
  scopeElement.className = "job-list__scope";
  scopeElement.setAttribute("role", "status");

  const textElement = document.createElement("div");
  textElement.className = "job-list__scope-text";

  const labelElement = document.createElement("p");
  labelElement.className = "job-list__scope-label";
  labelElement.textContent = "Jobs for selected AOI";

  const titleElement = document.createElement("p");
  titleElement.className = "job-list__scope-title";
  titleElement.textContent = aoiFilter.aoiName;

  textElement.append(labelElement, titleElement);

  const clearButton = createToolbarButton("Clear AOI filter");
  clearButton.addEventListener("click", clearAoiFilter);

  scopeElement.append(textElement, clearButton);

  return scopeElement;
}

function createJobFilterScope({ jobFilters, clearJobFilters }) {
  const scopeElement = document.createElement("div");
  scopeElement.className = "job-list__scope job-list__scope--filters";
  scopeElement.setAttribute("role", "status");

  const textElement = document.createElement("div");
  textElement.className = "job-list__scope-text";

  const labelElement = document.createElement("p");
  labelElement.className = "job-list__scope-label";
  labelElement.textContent = "Filters active";

  const titleElement = document.createElement("p");
  titleElement.className = "job-list__scope-title";
  titleElement.textContent = getActiveJobFilterSummary(jobFilters);

  textElement.append(labelElement, titleElement);

  const clearButton = createToolbarButton("Clear filters");
  clearButton.addEventListener("click", clearJobFilters);

  scopeElement.append(textElement, clearButton);

  return scopeElement;
}

function createListToolbar({
  state,
  visibleJobs,
  hiddenDoneCount,
  jobFilters,
  expandedJobIds,
  visibleDoneJobIds,
  store,
  runJobsRefresh,
  render,
}) {
  const toolbarElement = document.createElement("div");
  toolbarElement.className = "job-list__toolbar";

  const countGroupElement = document.createElement("div");
  countGroupElement.className = "job-list__count-group";

  const countElement = document.createElement("p");
  countElement.className = "job-list__count";
  countElement.textContent = `${visibleJobs.length} visible Jobs`;

  const hiddenDoneElement = document.createElement("p");
  hiddenDoneElement.className = "job-list__hidden-done-count";
  hiddenDoneElement.textContent = getDoneVisibilityText({
    hiddenDoneCount,
    jobFilters,
  });

  countGroupElement.append(countElement, hiddenDoneElement);

  const toolbarActionsElement = document.createElement("div");
  toolbarActionsElement.className = "job-list__toolbar-actions";

  const refreshActionsElement = document.createElement("div");
  refreshActionsElement.className = "job-list__toolbar-action-row";

  const refreshButton = createToolbarButton(state.isLoading ? "Refreshing..." : "Refresh");
  refreshButton.disabled = state.isLoading;
  refreshButton.addEventListener("click", async () => {
    await runJobsRefresh({
      source: "manual",
      showSuccessNoticeOnSuccess: true,
    });
  });

  refreshActionsElement.appendChild(refreshButton);

  const expandActionsElement = document.createElement("div");
  expandActionsElement.className = "job-list__toolbar-action-row";

  const expandAllButton = createToolbarButton("Expand all");
  expandAllButton.disabled =
    visibleJobs.length === 0 || areAllVisibleJobsExpanded(visibleJobs, expandedJobIds);
  expandAllButton.addEventListener("click", () => {
    for (const job of visibleJobs) {
      expandedJobIds.add(job.id);
    }

    render();
  });

  const collapseAllButton = createToolbarButton("Collapse all");
  collapseAllButton.disabled = !hasExpandedVisibleJobs(visibleJobs, expandedJobIds);
  collapseAllButton.addEventListener("click", () => {
    expandedJobIds.clear();
    render();
  });

  expandActionsElement.append(expandAllButton, collapseAllButton);
  toolbarActionsElement.append(refreshActionsElement, expandActionsElement);
  toolbarElement.append(countGroupElement, toolbarActionsElement);

  return toolbarElement;
}

function getDoneVisibilityText({ hiddenDoneCount, jobFilters }) {
  if (shouldRevealDoneJobsForFilters(jobFilters)) {
    return "Done filter active";
  }

  return hiddenDoneCount > 0 ? `${hiddenDoneCount} Done hidden` : "Done Jobs hidden";
}

function areAllVisibleJobsExpanded(visibleJobs, expandedJobIds) {
  return visibleJobs.length > 0 && visibleJobs.every((job) => expandedJobIds.has(job.id));
}

function hasExpandedVisibleJobs(visibleJobs, expandedJobIds) {
  return visibleJobs.some((job) => expandedJobIds.has(job.id));
}

function createToolbarButton(label) {
  const buttonElement = document.createElement("calcite-button");
  buttonElement.appearance = "outline";
  buttonElement.kind = "neutral";
  buttonElement.scale = "s";
  buttonElement.textContent = label;

  return buttonElement;
}

function createJobCard({
  job,
  selectedJobId,
  store,
  expandedJobIds,
  visibleDoneJobIds,
  pendingMutationJobIds,
  render,
}) {
  const isExpanded = expandedJobIds.has(job.id);
  const isSelected = job.id === selectedJobId;
  const cardElement = document.createElement("article");

  cardElement.className = "job-card";
  cardElement.dataset.jobId = job.id;
  cardElement.dataset.jobStatus = job.status;
  cardElement.dataset.jobPriority = job.priority;
  cardElement.tabIndex = -1;

  if (isSelected) {
    cardElement.classList.add("job-card--selected");
    cardElement.setAttribute("aria-label", `Selected Job: ${job.title}`);
  }

  cardElement.appendChild(
    createJobCardSummary({
      job,
      isExpanded,
      expandedJobIds,
      visibleDoneJobIds,
      pendingMutationJobIds,
      store,
      render,
    })
  );

  if (isExpanded) {
    cardElement.appendChild(createJobDetails(job));
  }

  return cardElement;
}

function createJobCardSummary({
  job,
  isExpanded,
  expandedJobIds,
  visibleDoneJobIds,
  pendingMutationJobIds,
  store,
  render,
}) {
  const summaryElement = document.createElement("div");
  summaryElement.className = "job-card__summary-layout";

  const topRowElement = document.createElement("div");
  topRowElement.className = "job-card__top-row";
  topRowElement.append(
    createJobTitleRow({ job, isExpanded, expandedJobIds, render }),
    createBadgeColumn(job)
  );

  const bottomRowElement = document.createElement("div");
  bottomRowElement.className = "job-card__bottom-row";
  bottomRowElement.append(
    createDateChips(job),
    createStatusActions({
      job,
      visibleDoneJobIds,
      pendingMutationJobIds,
      store,
      render,
    })
  );

  summaryElement.append(topRowElement, bottomRowElement);

  return summaryElement;
}

function createJobTitleRow({ job, isExpanded, expandedJobIds, render }) {
  const titleRowElement = document.createElement("div");
  titleRowElement.className = "job-card__title-row";

  const expandButton = document.createElement("calcite-action");
  expandButton.className = "job-card__expand-action";
  expandButton.icon = isExpanded ? "chevron-up" : "chevron-down";
  expandButton.text = isExpanded ? "Collapse Job details" : "Expand Job details";
  expandButton.title = isExpanded ? "Collapse Job details" : "Expand Job details";
  expandButton.addEventListener("click", () => {
    if (isExpanded) {
      expandedJobIds.delete(job.id);
    } else {
      expandedJobIds.add(job.id);
    }

    render();
  });

  const titleElement = document.createElement("h3");
  titleElement.className = "job-card__title";
  titleElement.textContent = job.title;

  titleRowElement.append(expandButton, titleElement);

  return titleRowElement;
}

function createBadgeColumn(job) {
  const badgeColumnElement = document.createElement("div");
  badgeColumnElement.className = "job-card__badge-column";
  badgeColumnElement.append(createPriorityBadge(job), createAffectedAoiBadge(job));

  return badgeColumnElement;
}

function createDateChips(job) {
  const containerElement = document.createElement("div");
  containerElement.className = "job-card__date-chips";
  containerElement.append(
    createDateChip({
      icon: "calendar",
      label: "Created",
      value: formatDate(job.createdAt),
    }),
    createDateChip({
      icon: "date-time",
      label: "Deadline",
      value: formatDate(job.deadline),
    })
  );

  return containerElement;
}

function createDateChip({ icon, label, value }) {
  const chipElement = document.createElement("span");
  chipElement.className = "job-card__date-chip";
  chipElement.title = `${label}: ${value}`;
  chipElement.setAttribute("aria-label", `${label}: ${value}`);

  const iconElement = document.createElement("calcite-icon");
  iconElement.icon = icon;
  iconElement.scale = "s";
  iconElement.setAttribute("aria-hidden", "true");

  const valueElement = document.createElement("span");
  valueElement.className = "job-card__date-chip-text";
  valueElement.textContent = value;

  chipElement.append(iconElement, valueElement);

  return chipElement;
}

function createPriorityBadge(job) {
  const priorityElement = document.createElement("span");
  priorityElement.className = `job-card__priority job-card__priority--${job.priority}`;
  priorityElement.textContent = getPriorityBadgeLabel(job.priority);

  return priorityElement;
}

function getPriorityBadgeLabel(priority) {
  switch (priority) {
    case "low":
      return "LOW";
    case "medium":
      return "MED";
    case "high":
      return "HIGH";
    default:
      return "MED";
  }
}

function createAffectedAoiBadge(job) {
  const aoiCount = job.relatedAoiIds.length;
  const impact = getAffectedAoiImpact(aoiCount);
  const badgeElement = document.createElement("span");

  badgeElement.className = `job-card__aoi-count job-card__aoi-count--${impact}`;
  badgeElement.textContent = String(aoiCount);
  badgeElement.title = `${aoiCount} affected AOI${aoiCount === 1 ? "" : "s"}`;
  badgeElement.setAttribute("aria-label", `${aoiCount} affected AOI${aoiCount === 1 ? "" : "s"}`);

  return badgeElement;
}

function getAffectedAoiImpact(aoiCount) {
  if (aoiCount <= 0) {
    return "none";
  }

  if (aoiCount === 1) {
    return "low";
  }

  if (aoiCount <= 3) {
    return "medium";
  }

  return "high";
}

function createStatusActions({ job, visibleDoneJobIds, pendingMutationJobIds, store, render }) {
  const actionsElement = document.createElement("div");
  actionsElement.className = "job-card__actions";

  for (const statusOption of JOB_STATUS_OPTIONS) {
    actionsElement.appendChild(
      createStatusButton({
        job,
        statusOption,
        visibleDoneJobIds,
        pendingMutationJobIds,
        store,
        render,
      })
    );
  }

  return actionsElement;
}

function createJobDetails(job) {
  const detailsElement = document.createElement("div");
  detailsElement.className = "job-card__details";

  const summaryElement = document.createElement("p");
  summaryElement.className = "job-card__description";
  summaryElement.textContent = job.summary || "No summary provided.";

  detailsElement.append(summaryElement);

  return detailsElement;
}

function createStatusButton({
  job,
  statusOption,
  visibleDoneJobIds,
  pendingMutationJobIds,
  store,
}) {
  const isActive = job.status === statusOption.value;
  const buttonElement = document.createElement("calcite-button");

  buttonElement.className = "job-status-button";
  buttonElement.scale = "s";
  buttonElement.kind = "brand";
  buttonElement.appearance = isActive ? "solid" : "outline";
  buttonElement.textContent = statusOption.label;

  if (isActive) {
    buttonElement.classList.add("job-status-button--active");
    buttonElement.setAttribute("aria-current", "true");
  }

  buttonElement.addEventListener("click", async () => {
    if (isActive || pendingMutationJobIds.has(job.id)) {
      return;
    }

    pendingMutationJobIds.add(job.id);

    if (statusOption.value === JOB_STATUS.DONE) {
      visibleDoneJobIds.add(job.id);
    }

    const result = await store.updateJobStatus(job.id, statusOption.value);

    pendingMutationJobIds.delete(job.id);

    if (!result.ok) {
      visibleDoneJobIds.delete(job.id);

      showErrorNotice({
        title: "Job update failed",
        message: result.error.message,
      });

      return;
    }

    showSuccessNotice({
      title: "Job status updated",
      message: `${result.data.job.title} is now ${statusOption.label}.`,
    });

    if (result.data.createdJobs.length > 0) {
      showInfoNotice({
        title: "New Job queued",
        message:
          "The mock backend created new work. It will appear after refresh or when the Jobs panel is reopened.",
      });
    }
  });

  return buttonElement;
}

function createLoadingState() {
  const containerElement = document.createElement("div");
  containerElement.className = "job-list__state job-list__state--loading";
  containerElement.setAttribute("role", "status");

  const titleElement = createStateTitle("Loading Jobs...");
  const messageElement = createStateMessage("The mock backend is loading the current Jobs list.");

  containerElement.append(titleElement, messageElement);

  return containerElement;
}

function createErrorState({ title, message, isLoading, onRetry }) {
  const containerElement = document.createElement("div");
  containerElement.className = "job-list__state job-list__state--error";
  containerElement.setAttribute("role", "alert");

  const contentElement = document.createElement("div");
  contentElement.className = "job-list__state-content";
  contentElement.append(createStateTitle(title), createStateMessage(message));

  const actionsElement = document.createElement("div");
  actionsElement.className = "job-list__state-actions";

  const retryButton = document.createElement("calcite-button");
  retryButton.scale = "s";
  retryButton.kind = "neutral";
  retryButton.appearance = "outline";
  retryButton.disabled = isLoading;
  retryButton.textContent = isLoading ? "Retrying..." : "Retry";
  retryButton.addEventListener("click", () => {
    onRetry?.();
  });

  actionsElement.append(retryButton);
  containerElement.append(contentElement, actionsElement);

  return containerElement;
}

function createInlineErrorState({ title, message, isLoading, onRetry }) {
  const containerElement = document.createElement("div");
  containerElement.className = "job-list__inline-error";
  containerElement.setAttribute("role", "status");

  const contentElement = document.createElement("div");
  contentElement.className = "job-list__state-content";
  contentElement.append(createStateTitle(title), createStateMessage(message));

  const retryButton = document.createElement("calcite-button");
  retryButton.scale = "s";
  retryButton.kind = "neutral";
  retryButton.appearance = "outline";
  retryButton.disabled = isLoading;
  retryButton.textContent = isLoading ? "Retrying..." : "Retry";
  retryButton.addEventListener("click", () => {
    onRetry?.();
  });

  containerElement.append(contentElement, retryButton);

  return containerElement;
}

function createStateTitle(text) {
  const titleElement = document.createElement("p");
  titleElement.className = "job-list__state-title";
  titleElement.textContent = text;

  return titleElement;
}

function createStateMessage(text) {
  const messageElement = document.createElement("p");
  messageElement.className = "job-list__state-message";
  messageElement.textContent = text;

  return messageElement;
}

function createEmptyState({ hiddenDoneCount, aoiFilter, jobFilters }) {
  const element = document.createElement("p");
  element.className = "job-list__state";

  if (aoiFilter && hasActiveJobFilters(jobFilters)) {
    element.textContent = "No related Jobs match the active filters for this AOI.";
    return element;
  }

  if (hasActiveJobFilters(jobFilters)) {
    element.textContent = "No Jobs match the active filters.";
    return element;
  }

  if (aoiFilter && hiddenDoneCount > 0) {
    element.textContent = "Only Done related Jobs were found. Done Jobs are hidden by default.";
    return element;
  }

  if (aoiFilter) {
    element.textContent = "No related active Jobs found for this AOI.";
    return element;
  }

  element.textContent =
    hiddenDoneCount > 0
      ? "No active Jobs found. Done Jobs are hidden by default."
      : "No Jobs found.";

  return element;
}

function createJobsRefreshedEvent({ source, jobs } = {}) {
  return new CustomEvent("job-manager:jobs-refreshed", {
    bubbles: true,
    detail: {
      source: normalizeOptionalString(source) || "manual",
      jobs: cloneJobsForRefreshEvent(jobs),
    },
  });
}

function cloneJobsForRefreshEvent(jobs = []) {
  if (!Array.isArray(jobs)) {
    return [];
  }

  return jobs.map((job) => ({
    ...job,
    relatedAoiIds: Array.isArray(job.relatedAoiIds) ? [...job.relatedAoiIds] : [],
  }));
}

function createAoiFilterClearedEvent() {
  return new CustomEvent("job-manager:aoi-filter-cleared", {
    bubbles: true,
  });
}

function normalizeAoiFilter(selectedAoi = {}) {
  return {
    aoiId: normalizeOptionalString(selectedAoi.aoiId ?? selectedAoi.id),
    aoiName: normalizeOptionalString(selectedAoi.aoiName ?? selectedAoi.name) || "Selected AOI",
  };
}

function normalizeSelectedJob(selectedJob = {}) {
  return {
    jobId: normalizeOptionalString(selectedJob.jobId ?? selectedJob.id),
  };
}

function focusJobCard(rootElement, jobId) {
  window.requestAnimationFrame(() => {
    const jobCard = [...rootElement.querySelectorAll("[data-job-id]")].find(
      (element) => element.dataset.jobId === jobId
    );

    if (!jobCard) {
      return;
    }

    jobCard.scrollIntoView({
      block: "nearest",
    });

    jobCard.focus({
      preventScroll: true,
    });
  });
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return DATE_FORMATTER.format(date);
}
