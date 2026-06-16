import {
  showErrorNotice,
  showInfoNotice,
  showSuccessNotice,
} from "../../notices/services/noticeService.js";
import { getJobPriorityLabel } from "../domain/jobPriority.js";
import { getJobStatusLabel, JOB_STATUS, JOB_STATUS_OPTIONS } from "../domain/jobStatus.js";
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

  if (visibleJobs.length === 0) {
    rootElement.replaceChildren(
      createListToolbar({ state, visibleJobs, hiddenDoneCount, store }),
      createEmptyState(hiddenDoneCount)
    );
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

  rootElement.replaceChildren(
    createListToolbar({ state, visibleJobs, hiddenDoneCount, store }),
    listElement
  );
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

function createListToolbar({ state, visibleJobs, hiddenDoneCount, store }) {
  const toolbarElement = document.createElement("div");
  toolbarElement.className = "job-list__toolbar";

  const countGroupElement = document.createElement("div");

  const countElement = document.createElement("p");
  countElement.className = "job-list__count";
  countElement.textContent = `${visibleJobs.length} active Jobs`;

  const hiddenDoneElement = document.createElement("p");
  hiddenDoneElement.className = "job-list__hidden-done-count";
  hiddenDoneElement.textContent =
    hiddenDoneCount > 0 ? `${hiddenDoneCount} Done hidden` : "Done Jobs hidden";

  countGroupElement.append(countElement, hiddenDoneElement);

  const refreshButton = document.createElement("calcite-button");
  refreshButton.appearance = "outline";
  refreshButton.kind = "neutral";
  refreshButton.scale = "s";
  refreshButton.textContent = state.isLoading ? "Refreshing..." : "Refresh";
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

  toolbarElement.append(countGroupElement, refreshButton);

  return toolbarElement;
}

function createJobCard({ job, state, store, expandedJobIds, render }) {
  const isExpanded = expandedJobIds.has(job.id);
  const isUpdating = state.updatingJobIds.has(job.id);

  const cardElement = document.createElement("article");
  cardElement.className = "job-card";
  cardElement.dataset.jobStatus = job.status;
  cardElement.dataset.jobPriority = job.priority;

  const headerElement = createJobCardHeader({
    job,
    isExpanded,
    expandedJobIds,
    render,
  });

  const actionsElement = createStatusActions({ job, isUpdating, store });

  cardElement.append(headerElement, actionsElement);

  if (isExpanded) {
    cardElement.appendChild(createJobDetails(job));
  }

  if (isUpdating) {
    cardElement.appendChild(createUpdatingState());
  }

  return cardElement;
}

function createJobCardHeader({ job, isExpanded, expandedJobIds, render }) {
  const headerElement = document.createElement("div");
  headerElement.className = "job-card__header";

  const titleGroupElement = document.createElement("div");
  titleGroupElement.className = "job-card__title-group";

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

  const statusElement = document.createElement("span");
  statusElement.className = `job-card__status job-card__status--${job.status}`;
  statusElement.textContent = getJobStatusLabel(job.status);

  titleGroupElement.append(titleRowElement, statusElement);

  const priorityElement = document.createElement("span");
  priorityElement.className = `job-card__priority job-card__priority--${job.priority}`;
  priorityElement.textContent = getJobPriorityLabel(job.priority);

  headerElement.append(titleGroupElement, priorityElement);

  return headerElement;
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
  summaryElement.className = "job-card__summary";
  summaryElement.textContent = job.summary || "No summary provided.";

  const metaElement = document.createElement("dl");
  metaElement.className = "job-card__meta";

  appendMetaItem(metaElement, "Created", formatDate(job.createdAt));
  appendMetaItem(metaElement, "Deadline", formatDate(job.deadline));
  appendMetaItem(metaElement, "Related AOIs", String(job.relatedAoiIds.length));

  detailsElement.append(summaryElement, metaElement);

  return detailsElement;
}

function createUpdatingState() {
  const updatingElement = document.createElement("p");
  updatingElement.className = "job-card__updating";
  updatingElement.textContent = "Updating Job status...";

  return updatingElement;
}

function createStatusButton({ job, statusOption, isUpdating, store }) {
  const buttonElement = document.createElement("calcite-button");
  buttonElement.className = `job-status-button job-status-button--${statusOption.value}`;
  buttonElement.scale = "s";
  buttonElement.kind = "neutral";
  buttonElement.appearance = job.status === statusOption.value ? "solid" : "outline";
  buttonElement.disabled = isUpdating || job.status === statusOption.value;
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

function appendMetaItem(metaElement, label, value) {
  const termElement = document.createElement("dt");
  termElement.textContent = label;

  const valueElement = document.createElement("dd");
  valueElement.textContent = value || "-";

  metaElement.append(termElement, valueElement);
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
