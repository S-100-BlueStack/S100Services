import {
  showErrorNotice,
  showInfoNotice,
  showSuccessNotice,
} from "../../notices/services/noticeService.js";
import { getJobGeometryTypeLabel } from "../domain/jobModel.js";
import { getJobPriorityLabel } from "../domain/jobPriority.js";
import { getJobStatusLabel, JOB_STATUS_OPTIONS } from "../domain/jobStatus.js";
import { createJobStore } from "../state/jobStore.js";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
});

export function createJobList() {
  const store = createJobStore();
  const rootElement = document.createElement("div");
  rootElement.className = "job-list";

  const unsubscribe = store.subscribe((state) => {
    renderJobList(rootElement, state, store);
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

function renderJobList(rootElement, state, store) {
  if (state.isLoading && state.jobs.length === 0) {
    rootElement.replaceChildren(createLoadingState());
    return;
  }

  if (state.error && state.jobs.length === 0) {
    rootElement.replaceChildren(createErrorState(state.error, store));
    return;
  }

  if (state.jobs.length === 0) {
    rootElement.replaceChildren(createEmptyState());
    return;
  }

  const listElement = document.createElement("div");
  listElement.className = "job-list__items";

  for (const job of state.jobs) {
    listElement.appendChild(createJobCard(job, state, store));
  }

  rootElement.replaceChildren(createListToolbar(state, store), listElement);
}

function createListToolbar(state, store) {
  const toolbarElement = document.createElement("div");
  toolbarElement.className = "job-list__toolbar";

  const countElement = document.createElement("p");
  countElement.className = "job-list__count";
  countElement.textContent = `${state.jobs.length} Jobs`;

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

  toolbarElement.append(countElement, refreshButton);

  return toolbarElement;
}

function createJobCard(job, state, store) {
  const isUpdating = state.updatingJobIds.has(job.id);

  const cardElement = document.createElement("article");
  cardElement.className = "job-card";

  const headerElement = document.createElement("div");
  headerElement.className = "job-card__header";

  const titleElement = document.createElement("h3");
  titleElement.className = "job-card__title";
  titleElement.textContent = job.title;

  const priorityElement = document.createElement("span");
  priorityElement.className = `job-card__priority job-card__priority--${job.priority}`;
  priorityElement.textContent = getJobPriorityLabel(job.priority);

  headerElement.append(titleElement, priorityElement);

  const summaryElement = document.createElement("p");
  summaryElement.className = "job-card__summary";
  summaryElement.textContent = job.summary || "No summary provided.";

  const metaElement = document.createElement("dl");
  metaElement.className = "job-card__meta";

  appendMetaItem(metaElement, "Status", getJobStatusLabel(job.status));
  appendMetaItem(metaElement, "Created", formatDate(job.createdAt));
  appendMetaItem(metaElement, "Deadline", formatDate(job.deadline));
  appendMetaItem(metaElement, "Geometry", getJobGeometryTypeLabel(job));
  appendMetaItem(metaElement, "Related AOIs", String(job.relatedAoiIds.length));

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

  if (isUpdating) {
    const updatingElement = document.createElement("p");
    updatingElement.className = "job-card__updating";
    updatingElement.textContent = "Updating Job status...";
    cardElement.append(headerElement, summaryElement, metaElement, actionsElement, updatingElement);

    return cardElement;
  }

  cardElement.append(headerElement, summaryElement, metaElement, actionsElement);

  return cardElement;
}

function createStatusButton({ job, statusOption, isUpdating, store }) {
  const buttonElement = document.createElement("calcite-button");
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

function createEmptyState() {
  const element = document.createElement("p");
  element.className = "job-list__state";
  element.textContent = "No Jobs found.";

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
