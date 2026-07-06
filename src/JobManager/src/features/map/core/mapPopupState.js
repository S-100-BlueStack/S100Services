export function closePopupIfAggregate({ view } = {}) {
  return closePopupWhen({
    view,
    shouldClose(popup) {
      return isAggregatePopupOpen(popup);
    },
  });
}

export function closePopupIfJob({ view, jobId } = {}) {
  return closePopupWhen({
    view,
    shouldClose(popup) {
      return isJobPopupOpen(popup, {
        jobId,
      });
    },
  });
}

export function isAggregatePopupOpen(popup) {
  return getPopupCandidateFeatures(popup).some(isAggregatePopupFeature);
}

export function isJobPopupOpen(popup, { jobId } = {}) {
  return getPopupCandidateFeatures(popup).some((feature) =>
    isJobPopupFeature(feature, {
      jobId,
    })
  );
}

export function isJobPopupFeature(feature, { jobId } = {}) {
  if (!feature || isAggregatePopupFeature(feature)) {
    return false;
  }

  const featureJobId = getJobIdFromAttributes(feature.attributes);

  if (!featureJobId) {
    return false;
  }

  const requestedJobId = normalizeOptionalString(jobId);

  return !requestedJobId || featureJobId === requestedJobId;
}

export function isAggregatePopupFeature(feature) {
  if (!feature) {
    return false;
  }

  if (feature.isAggregate === true) {
    return true;
  }

  if (hasClusterCountAttribute(feature.attributes)) {
    return true;
  }

  return hasClusterPopupTemplate(feature.popupTemplate);
}

function getPopupCandidateFeatures(popup) {
  return dedupeByReference([
    popup?.selectedFeature,
    popup?.viewModel?.selectedFeature,
    ...normalizeFeatureCollection(popup?.features),
    ...normalizeFeatureCollection(popup?.viewModel?.features),
  ]).filter(Boolean);
}

function normalizeFeatureCollection(features) {
  if (!features) {
    return [];
  }

  if (Array.isArray(features)) {
    return features;
  }

  if (typeof features.toArray === "function") {
    return features.toArray();
  }

  return [];
}

function hasClusterCountAttribute(attributes) {
  if (!attributes || typeof attributes !== "object") {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(attributes, "cluster_count");
}

function hasClusterPopupTemplate(popupTemplate) {
  const title = popupTemplate?.title;

  return typeof title === "string" && title.includes("cluster_count");
}

function dedupeByReference(values) {
  return [...new Set(values)];
}
function closePopupWhen({ view, shouldClose } = {}) {
  const popup = view?.popup;

  if (!popup || !shouldClose?.(popup)) {
    return false;
  }

  if (typeof view?.closePopup === "function") {
    view.closePopup();
    return true;
  }

  popup.close?.();
  return true;
}

function getJobIdFromAttributes(attributes) {
  if (!attributes || typeof attributes !== "object") {
    return "";
  }

  return (
    normalizeOptionalString(attributes.jobId) ||
    normalizeOptionalString(attributes.JOB_ID) ||
    normalizeOptionalString(attributes.job_id)
  );
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
