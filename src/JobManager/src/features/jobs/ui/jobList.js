import {
  showErrorNotice,
  showInfoNotice,
  showSuccessNotice,
} from "../../notices/services/noticeService.js";
import { JOB_STATUS, JOB_STATUS_OPTIONS } from "../domain/jobStatus.js";
import { createJobStore } from "../state/jobStore.js";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
});

export function createJobList() {
  const store = createJobStore();
  const rootElement = document.createElement("div");
  rootElement.className = "job-list";

  let currentState = store.getSnapshot();
  const expandedJobIds = new Set();
  const visibleDoneJobIds = new Set();
  const pendingMutationJobIds = new Set();

  const render = () => {
    renderJobList({
      rootElement,
      state: currentState,
      store,
      expandedJobIds,
      visibleDoneJobIds,
      pendingMutationJobIds,
      render,
    });
  };

  const unsubscribe = store.subscribe((state) => {
    currentState = state;
    removeInvisibleExpandedJobs(expandedJobIds, state.jobs, visibleDoneJobIds);
    removeMissingVisibleDoneJobs(visibleDoneJobIds, state.jobs);
    render();
  });

  loadJobs(store, visibleDoneJobIds);

  return {
    element: rootElement,
    refreshJobs() {
      return loadJobs(store, visibleDoneJobIds);
    },
    hideCompletedJobs() {
      visibleDoneJobIds.clear();
      removeInvisibleExpandedJobs(expandedJobIds, currentState.jobs, visibleDoneJobIds);
      render();
    },
    destroy() {
      unsubscribe();
      rootElement.replaceChildren();
    },
  };
}

async function loadJobs(store, visibleDoneJobIds) {
  visibleDoneJobIds.clear();

  const result = await store.loadJobs();

  if (!result.ok) {
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
  expandedJobIds,
  visibleDoneJobIds,
  pendingMutationJobIds,
  render,
}) {
  const visibleJobs = getVisibleJobs(state.jobs, visibleDoneJobIds);
  const hiddenDoneCount = getHiddenDoneCount(state.jobs, visibleDoneJobIds);

  if (state.isLoading && state.jobs.length === 0) {
    rootElement.replaceChildren(createLoadingState());
    return;
  }

  if (state.error && state.jobs.length === 0) {
    rootElement.replaceChildren(createErrorState(state.error, store, visibleDoneJobIds));
    return;
  }

  const toolbarElement = createListToolbar({
    state,
    visibleJobs,
    hiddenDoneCount,
    expandedJobIds,
    visibleDoneJobIds,
    store,
    render,
  });

  if (visibleJobs.length === 0) {
    rootElement.replaceChildren(toolbarElement, createEmptyState(hiddenDoneCount));
    return;
  }

  const listElement = document.createElement("div");
  listElement.className = "job-list__items";

  for (const job of visibleJobs) {
    listElement.appendChild(
      createJobCard({
        job,
        store,
        expandedJobIds,
        visibleDoneJobIds,
        pendingMutationJobIds,
        render,
      })
    );
  }

  rootElement.replaceChildren(toolbarElement, listElement);
}

function getVisibleJobs(jobs, visibleDoneJobIds) {
  return jobs.filter((job) => job.status !== JOB_STATUS.DONE || visibleDoneJobIds.has(job.id));
}

function getHiddenDoneCount(jobs, visibleDoneJobIds) {
  return jobs.filter((job) => job.status === JOB_STATUS.DONE && !visibleDoneJobIds.has(job.id))
    .length;
}

function removeInvisibleExpandedJobs(expandedJobIds, jobs, visibleDoneJobIds) {
  const visibleJobIds = new Set(getVisibleJobs(jobs, visibleDoneJobIds).map((job) => job.id));

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

function createListToolbar({
  state,
  visibleJobs,
  hiddenDoneCount,
  expandedJobIds,
  visibleDoneJobIds,
  store,
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
  hiddenDoneElement.textContent =
    hiddenDoneCount > 0 ? `${hiddenDoneCount} Done hidden` : "Done Jobs hidden";

  countGroupElement.append(countElement, hiddenDoneElement);

  const toolbarActionsElement = document.createElement("div");
  toolbarActionsElement.className = "job-list__toolbar-actions";

  const refreshActionsElement = document.createElement("div");
  refreshActionsElement.className = "job-list__toolbar-action-row";

  const refreshButton = createToolbarButton(state.isLoading ? "Refreshing..." : "Refresh");
  refreshButton.disabled = state.isLoading;

  refreshButton.addEventListener("click", async () => {
    const result = await loadJobs(store, visibleDoneJobIds);

    if (result.ok) {
      showSuccessNotice({
        title: "Jobs refreshed",
        message: "The mock Jobs list has been refreshed.",
      });
    } else {
      showErrorNotice({
        title: "Refresh failed",
        message: result.error.message,
      });
    }
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
  store,
  expandedJobIds,
  visibleDoneJobIds,
  pendingMutationJobIds,
  render,
}) {
  const isExpanded = expandedJobIds.has(job.id);

  const cardElement = document.createElement("article");
  cardElement.className = "job-card";
  cardElement.dataset.jobStatus = job.status;
  cardElement.dataset.jobPriority = job.priority;

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
    createJobTitleRow({
      job,
      isExpanded,
      expandedJobIds,
      render,
    }),
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
  const element = document.createElement("p");
  element.className = "job-list__state";
  element.textContent = "Loading Jobs...";

  return element;
}

function createErrorState(error, store, visibleDoneJobIds) {
  const containerElement = document.createElement("div");
  containerElement.className = "job-list__state job-list__state--error";

  const messageElement = document.createElement("p");
  messageElement.textContent = error.message;

  const retryButton = document.createElement("calcite-button");
  retryButton.scale = "s";
  retryButton.kind = "neutral";
  retryButton.textContent = "Retry";

  retryButton.addEventListener("click", () => {
    loadJobs(store, visibleDoneJobIds);
  });

  containerElement.append(messageElement, retryButton);

  return containerElement;
}

function createEmptyState(hiddenDoneCount) {
  const element = document.createElement("p");
  element.className = "job-list__state";
  element.textContent =
    hiddenDoneCount > 0
      ? "No active Jobs found. Done Jobs are hidden by default."
      : "No Jobs found.";

  return element;
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
