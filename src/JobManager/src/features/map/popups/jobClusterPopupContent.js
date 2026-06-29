import CustomContent from "@arcgis/core/popup/content/CustomContent.js";

import { getJobPriorityLabel } from "../../jobs/domain/jobPriority.js";
import { getJobStatusLabel } from "../../jobs/domain/jobStatus.js";
import { JOB_LAYER_FIELD } from "../layers/jobLayerFeatureData.js";

export function createJobClusterPickerContent({ view } = {}) {
  return new CustomContent({
    outFields: ["*"],
    creator(event) {
      const container = document.createElement("div");
      container.className = "job-manager-cluster-picker";

      if (!view) {
        renderClusterPickerMessage({
          container,
          message: "Zoom in to inspect individual Jobs.",
        });

        return container;
      }

      renderClusterPickerMessage({
        container,
        message: "Loading Jobs...",
      });

      void renderClusterJobs({
        container,
        view,
        clusterGraphic: event?.graphic,
      });

      return container;
    },
  });
}

async function renderClusterJobs({ container, view, clusterGraphic }) {
  try {
    const features = await queryClusterFeatures({
      view,
      clusterGraphic,
    });

    if (features.length === 0) {
      renderClusterPickerMessage({
        container,
        message: "No visible Jobs could be resolved for this cluster.",
      });

      return;
    }

    renderClusterPicker({
      container,
      view,
      features,
      location: clusterGraphic?.geometry,
    });
  } catch (error) {
    renderClusterPickerMessage({
      container,
      message: error.message || "The Jobs in this cluster could not be loaded.",
    });
  }
}

async function queryClusterFeatures({ view, clusterGraphic }) {
  if (!clusterGraphic?.isAggregate) {
    return [];
  }

  const layer = clusterGraphic.layer;

  if (!layer) {
    throw new Error("Cluster layer is not available.");
  }

  const aggregateObjectId = clusterGraphic.getObjectId?.();

  if (aggregateObjectId === null || aggregateObjectId === undefined) {
    throw new Error("Cluster identifier is not available.");
  }

  const layerView = await view.whenLayerView(layer);
  const query = layerView.createQuery();

  query.aggregateIds = [aggregateObjectId];
  query.outFields = ["*"];
  query.returnGeometry = true;

  const featureSet = await layerView.queryFeatures(query);

  return sortClusterFeatures(featureSet.features ?? []);
}

function renderClusterPicker({ container, view, features, location }) {
  const listElement = document.createElement("div");
  listElement.className = "job-manager-cluster-picker__list";

  for (const feature of features) {
    listElement.appendChild(
      createClusterJobButton({
        view,
        feature,
        location,
      })
    );
  }

  container.replaceChildren(listElement);
}

function createClusterJobButton({ view, feature, location }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "job-manager-cluster-picker__item";

  const priorityMarker = document.createElement("span");
  priorityMarker.className = "job-manager-cluster-picker__priority-marker";
  priorityMarker.dataset.priority = normalizeOptionalString(
    feature.attributes?.[JOB_LAYER_FIELD.PRIORITY]
  );

  const content = document.createElement("span");
  content.className = "job-manager-cluster-picker__content";

  const title = document.createElement("span");
  title.className = "job-manager-cluster-picker__job-title";
  title.textContent = getFeatureTitle(feature);

  const subtitle = document.createElement("span");
  subtitle.className = "job-manager-cluster-picker__job-subtitle";
  subtitle.textContent = getFeatureSubtitle(feature);

  content.append(title, subtitle);
  button.append(priorityMarker, content);

  button.addEventListener("click", () => {
    openJobFeaturePopup(view, {
      feature,
      location,
    });
  });

  return button;
}

function openJobFeaturePopup(view, { feature, location }) {
  ensureGraphicHasPopupTemplate(feature);

  const popupLocation = feature.geometry ?? location;

  if (typeof view.openPopup === "function") {
    view.openPopup({
      features: [feature],
      location: popupLocation,
    });

    return;
  }

  view.popup.open({
    features: [feature],
    location: popupLocation,
  });
}

function ensureGraphicHasPopupTemplate(graphic) {
  if (graphic.popupTemplate) {
    return;
  }

  const layerPopupTemplate = graphic.layer?.popupTemplate;

  if (layerPopupTemplate) {
    graphic.popupTemplate = layerPopupTemplate;
  }
}

function renderClusterPickerMessage({ container, message }) {
  const messageElement = document.createElement("p");
  messageElement.className = "job-manager-cluster-picker__message";
  messageElement.textContent = message;

  container.replaceChildren(messageElement);
}

function sortClusterFeatures(features) {
  return [...features].sort((a, b) => {
    const priorityComparison = getPriorityRank(a) - getPriorityRank(b);

    if (priorityComparison !== 0) {
      return priorityComparison;
    }

    const statusComparison = getStatusRank(a) - getStatusRank(b);

    if (statusComparison !== 0) {
      return statusComparison;
    }

    return getFeatureTitle(a).localeCompare(getFeatureTitle(b));
  });
}

function getPriorityRank(feature) {
  switch (normalizeOptionalString(feature.attributes?.[JOB_LAYER_FIELD.PRIORITY])) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
      return 2;
    default:
      return 3;
  }
}

function getStatusRank(feature) {
  switch (normalizeOptionalString(feature.attributes?.[JOB_LAYER_FIELD.STATUS])) {
    case "todo":
      return 0;
    case "inProgress":
      return 1;
    case "done":
      return 2;
    default:
      return 3;
  }
}

function getFeatureTitle(feature) {
  return normalizeOptionalString(feature.attributes?.[JOB_LAYER_FIELD.TITLE]) || "Untitled Job";
}

function getFeatureSubtitle(feature) {
  const attributes = feature.attributes ?? {};
  const parts = [];

  const status = normalizeOptionalString(attributes[JOB_LAYER_FIELD.STATUS]);
  const priority = normalizeOptionalString(attributes[JOB_LAYER_FIELD.PRIORITY]);
  const deadline = normalizeOptionalString(attributes[JOB_LAYER_FIELD.DEADLINE]);
  const relatedAoiCount = Number(attributes[JOB_LAYER_FIELD.RELATED_AOI_COUNT] ?? 0);

  if (status) {
    parts.push(`Status: ${getJobStatusLabel(status)}`);
  }

  if (priority) {
    parts.push(`Priority: ${getJobPriorityLabel(priority)}`);
  }

  if (deadline && deadline !== "-") {
    parts.push(`Deadline: ${deadline}`);
  }

  parts.push(`${Number.isFinite(relatedAoiCount) ? relatedAoiCount : 0} affected AOIs`);

  return parts.join(" · ");
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
