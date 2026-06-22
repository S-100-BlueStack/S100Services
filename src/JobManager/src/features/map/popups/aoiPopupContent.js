import { createDefaultJobFilters, hasActiveJobFilters } from "../../jobs/domain/jobFilters.js";
import { getAoiJobSummary } from "../../relations/domain/aoiJobSummary.js";
import * as defaultRelationService from "../../relations/services/relationService.js";
import { createAoiSelectionFromGraphic } from "./aoiPopupActions.js";

const AOI_JOB_SUMMARY_POPUP_CONTENT_ID = "job-manager-aoi-job-summary";

export function configureAoiJobSummaryPopupContent({
  aoiLayer,
  getJobFilters,
  relationService = defaultRelationService,
} = {}) {
  if (!aoiLayer?.popupTemplate) {
    return {
      ok: true,
      applied: false,
      reason: "aoi-popup-template-missing",
    };
  }

  const popupTemplate = aoiLayer.popupTemplate;
  const existingContent = normalizePopupContent(popupTemplate.content).filter(
    (contentItem) => contentItem?.id !== AOI_JOB_SUMMARY_POPUP_CONTENT_ID
  );

  popupTemplate.content = [
    ...existingContent,
    createAoiJobSummaryPopupContent({
      getJobFilters,
      relationService,
    }),
  ];

  return {
    ok: true,
    applied: true,
  };
}

export function createAoiJobSummaryPopupContent({
  getJobFilters,
  relationService = defaultRelationService,
} = {}) {
  return {
    id: AOI_JOB_SUMMARY_POPUP_CONTENT_ID,
    type: "custom",
    creator(event) {
      const containerElement = createSummaryContainer();

      renderLoadingState(containerElement);

      void renderAoiJobSummary({
        containerElement,
        graphic: event?.graphic ?? event,
        getJobFilters,
        relationService,
      });

      return containerElement;
    },
  };
}

async function renderAoiJobSummary({ containerElement, graphic, getJobFilters, relationService }) {
  const selectedAoi = createAoiSelectionFromGraphic(graphic);

  if (!selectedAoi.aoiId) {
    renderMessageState({
      containerElement,
      message: "Job summary is unavailable because this AOI has no usable identifier.",
    });

    return;
  }

  if (!relationService?.loadAoiJobRelationSnapshot) {
    renderMessageState({
      containerElement,
      message: "Job summary could not be loaded because the relation service is unavailable.",
    });

    return;
  }

  const jobFilters = resolveJobFilters(getJobFilters);

  try {
    const relationSnapshotResult = await relationService.loadAoiJobRelationSnapshot({
      jobFilters,
    });

    if (!relationSnapshotResult.ok) {
      renderMessageState({
        containerElement,
        message: relationSnapshotResult.error.message,
      });

      return;
    }

    const summary = getAoiJobSummary(relationSnapshotResult.data.summaryByAoiId, selectedAoi.aoiId);

    renderSummaryState({
      containerElement,
      summary,
      filtersActive: hasActiveJobFilters(jobFilters),
    });
  } catch (error) {
    renderMessageState({
      containerElement,
      message: error?.message || "Job summary could not be loaded.",
    });
  }
}

function createSummaryContainer() {
  const containerElement = document.createElement("section");
  containerElement.className = "job-manager-aoi-popup-summary";
  containerElement.setAttribute("aria-label", "Related Jobs summary");

  return containerElement;
}

function renderLoadingState(containerElement) {
  renderMessageState({
    containerElement,
    message: "Loading related Jobs...",
  });
}

function renderMessageState({ containerElement, message }) {
  const titleElement = createTitleElement();

  const messageElement = document.createElement("p");
  messageElement.className = "job-manager-aoi-popup-summary__message";
  messageElement.textContent = message;

  containerElement.replaceChildren(titleElement, messageElement);
}

function renderSummaryState({ containerElement, summary, filtersActive }) {
  const titleElement = createTitleElement();

  const metricsElement = document.createElement("div");
  metricsElement.className = "job-manager-aoi-popup-summary__metrics";
  metricsElement.append(
    createMetricElement({
      label: "Related Jobs",
      value: summary.total,
    }),
    createMetricElement({
      label: "Active Jobs",
      value: summary.active,
    }),
    createMetricElement({
      label: "High-priority active Jobs",
      value: summary.activeHighPriority,
    })
  );

  const hintElement = document.createElement("p");
  hintElement.className = "job-manager-aoi-popup-summary__hint";
  hintElement.textContent =
    summary.total > 0
      ? getSummaryHint({ filtersActive })
      : "No related Jobs match the current Job filters for this AOI.";

  containerElement.replaceChildren(titleElement, metricsElement, hintElement);
}

function createTitleElement() {
  const titleElement = document.createElement("h3");
  titleElement.className = "job-manager-aoi-popup-summary__title";
  titleElement.textContent = "Related Jobs";

  return titleElement;
}

function createMetricElement({ label, value }) {
  const metricElement = document.createElement("div");
  metricElement.className = "job-manager-aoi-popup-summary__metric";

  const valueElement = document.createElement("span");
  valueElement.className = "job-manager-aoi-popup-summary__metric-value";
  valueElement.textContent = String(value);

  const labelElement = document.createElement("span");
  labelElement.className = "job-manager-aoi-popup-summary__metric-label";
  labelElement.textContent = label;

  metricElement.append(valueElement, labelElement);

  return metricElement;
}

function getSummaryHint({ filtersActive }) {
  if (filtersActive) {
    return "Counts reflect the active Job filters.";
  }

  return "Done Jobs are hidden by default unless the Done filter is active.";
}

function resolveJobFilters(getJobFilters) {
  const filters = getJobFilters?.();

  if (filters === null || filters === undefined) {
    return createDefaultJobFilters();
  }

  return filters;
}

function normalizePopupContent(content) {
  if (Array.isArray(content)) {
    return content;
  }

  if (typeof content?.toArray === "function") {
    return content.toArray();
  }

  if (!content) {
    return [];
  }

  return [content];
}
