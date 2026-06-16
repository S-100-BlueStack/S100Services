import {
  showErrorNotice,
  showInfoNotice,
  showSuccessNotice,
} from "../../notices/services/noticeService.js";
import { getJobPriorityLabel } from "../domain/jobPriority.js";
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

  const render = () => {
    renderJobList(rootElement, currentState, store, expandedJobIds, render);
  };

  const unsubscribe = store.subscribe((state) => {
    currentState = state;
    removeExpandedDoneJobs(expandedJobIds, state.jobs);
    render();
  });

  loadJobs(store);

  return {
    element: rootElement,
    destroy() {
      unsubscribe();
      rootElement.replaceChildren();
    },
  };
}

async function loadJobs(store) {
  const result = await store.loadJobs();

  if (!result.ok) {
    showErrorNotice({
      title: "Jobs could not be loaded",
      message: result.error.message,
    });
  }
}

function renderJobList(rootElement, state, store, expandedJobIds, render) {
  const visibleJobs = getVisibleJobs(state.jobs);
  const hiddenDoneCount = state.jobs.length - visibleJobs.length;

  if (state.isLoading && state.jobs.length === 0) {
    rootElement.replaceChildren(createLoadingState());
    return;
  }

  if (state.error && state.jobs.length === 0) {
    rootElement.replaceChildren(createErrorState(state.error, store));
    return;
  }

  const toolbarElement = createListToolbar({
    state,
    visibleJobs,
    hiddenDoneCount,
    expandedJobIds,
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
        state,
        store,
        expandedJobIds,
        render,
      })
    );
  }

  rootElement.replaceChildren(toolbarElement, listElement);
}

function getVisibleJobs(jobs) {
  return jobs.filter((job) => job.status !== JOB_STATUS.DONE);
}

function removeExpandedDoneJobs(expandedJobIds, jobs) {
  const activeJobIds = new Set(
    jobs.filter((job) => job.status !== JOB_STATUS.DONE).map((job) => job.id)
  );

  for (const jobId of expandedJobIds) {
    if (!activeJobIds.has(jobId)) {
      expandedJobIds.delete(jobId);
    }
  }
}

function createListToolbar({ state, visibleJobs, hiddenDoneCount, expandedJobIds, store, render }) {
  const toolbarElement = document.createElement("div");
  toolbarElement.className = "job-list__toolbar";

  const countGroupElement = document.createElement("div");
  countGroupElement.className = "job-list__count-group";

  const countElement = document.createElement("p");
  countElement.className = "job-list__count";
  countElement.textContent = `${visibleJobs.length} active Jobs`;

  const hiddenDoneElement = document.createElement("p");
  hiddenDoneElement.className = "job-list__hidden-done-count";
  hiddenDoneElement.textContent =
    hiddenDoneCount > 0 ? `${hiddenDoneCount} Done hidden` : "Done Jobs hidden";

  countGroupElement.append(countElement, hiddenDoneElement);

  const toolbarActionsElement = document.createElement("div");
  toolbarActionsElement.className = "job-list__toolbar-actions";

  const refreshButton = createToolbarButton(state.isLoading ? "Refreshing..." : "Refresh");
  refreshButton.disabled = state.isLoading;

  refreshButton.addEventListener("click", async () => {
    const result = await store.loadJobs();

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

  const expandAllButton = createToolbarButton("Expand all");
  expandAllButton.disabled = visibleJobs.length === 0;

  expandAllButton.addEventListener("click", () => {
    for (const job of visibleJobs) {
      expandedJobIds.add(job.id);
    }

    render();
  });

  const collapseAllButton = createToolbarButton("Collapse all");
  collapseAllButton.disabled = expandedJobIds.size === 0;

  collapseAllButton.addEventListener("click", () => {
    expandedJobIds.clear();
    render();
  });

  toolbarActionsElement.append(refreshButton, expandAllButton, collapseAllButton);
  toolbarElement.append(countGroupElement, toolbarActionsElement);

  return toolbarElement;
}

function createToolbarButton(label) {
  const buttonElement = document.createElement("calcite-button");
  buttonElement.appearance = "outline";
  buttonElement.kind = "neutral";
  buttonElement.scale = "s";
  buttonElement.textContent = label;

  return buttonElement;
}

function createJobCard({ job, state, store, expandedJobIds, render }) {
  const isExpanded = expandedJobIds.has(job.id);
  const isUpdating = state.updatingJobIds.has(job.id);

  const cardElement = document.createElement("article");
  cardElement.className = "job-card";
  cardElement.dataset.jobStatus = job.status;
  cardElement.dataset.jobPriority = job.priority;

  cardElement.appendChild(
    createJobCardSummary({
      job,
      isExpanded,
      isUpdating,
      expandedJobIds,
      store,
      render,
    })
  );

  if (isExpanded) {
    cardElement.appendChild(createJobDetails(job));
  }

  if (isUpdating) {
    cardElement.appendChild(createUpdatingState());
  }

  return cardElement;
}

function createJobCardSummary({ job, isExpanded, isUpdating, expandedJobIds, store, render }) {
  const summaryElement = document.createElement("div");
  summaryElement.className = "job-card__summary-layout";

  const leftElement = document.createElement("div");
  leftElement.className = "job-card__left";

  leftElement.append(
    createJobTitleRow({
      job,
      isExpanded,
      expandedJobIds,
      render,
    }),
    createDateChips(job)
  );

  const rightElement = document.createElement("div");
  rightElement.className = "job-card__right";

  rightElement.append(
    createPriorityBadge(job),
    createAffectedAoiBadge(job),
    createStatusActions({ job, isUpdating, store })
  );

  summaryElement.append(leftElement, rightElement);

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
  valueElement.textContent = value;

  chipElement.append(iconElement, valueElement);

  return chipElement;
}

function createPriorityBadge(job) {
  const priorityElement = document.createElement("span");
  priorityElement.className = `job-card__priority job-card__priority--${job.priority}`;
  priorityElement.textContent = getJobPriorityLabel(job.priority);

  return priorityElement;
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

function createStatusActions({ job, isUpdating, store }) {
  const actionsElement = document.createElement("div");
  actionsElement.className = "job-card__actions";

  for (const statusOption of JOB_STATUS_OPTIONS) {
    actionsElement.appendChild(
      createStatusButton({
        job,
        statusOption,
        isUpdating,
        store,
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

function createUpdatingState() {
  const updatingElement = document.createElement("p");
  updatingElement.className = "job-card__updating";
  updatingElement.textContent = "Updating Job status...";

  return updatingElement;
}

function createStatusButton({ job, statusOption, isUpdating, store }) {
  const isActive = job.status === statusOption.value;

  const buttonElement = document.createElement("calcite-button");
  buttonElement.className = `job-status-button job-status-button--${statusOption.value}`;

  if (isActive) {
    buttonElement.classList.add("job-status-button--active");
  }

  buttonElement.scale = "s";
  buttonElement.kind = getStatusButtonKind(statusOption.value);
  buttonElement.appearance = isActive ? "solid" : "outline";
  buttonElement.disabled = isUpdating || isActive;
  buttonElement.textContent = statusOption.label;

  buttonElement.addEventListener("click", async () => {
    const result = await store.updateJobStatus(job.id, statusOption.value);

    if (!result.ok) {
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
        title: "New Job created",
        message: "The mock backend created a follow-up Job to simulate cyclic work.",
      });
    }
  });

  return buttonElement;
}

function getStatusButtonKind(status) {
  switch (status) {
    case JOB_STATUS.TODO:
      return "brand";
    case JOB_STATUS.IN_PROGRESS:
      return "warning";
    case JOB_STATUS.DONE:
      return "success";
    default:
      return "neutral";
  }
}

function createLoadingState() {
  const element = document.createElement("p");
  element.className = "job-list__state";
  element.textContent = "Loading Jobs...";

  return element;
}

function createErrorState(error, store) {
  const containerElement = document.createElement("div");
  containerElement.className = "job-list__state job-list__state--error";

  const messageElement = document.createElement("p");
  messageElement.textContent = error.message;

  const retryButton = document.createElement("calcite-button");
  retryButton.scale = "s";
  retryButton.kind = "neutral";
  retryButton.textContent = "Retry";

  retryButton.addEventListener("click", () => {
    loadJobs(store);
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
