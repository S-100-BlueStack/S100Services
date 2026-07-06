export function closePopupIfAggregate({ view } = {}) {
  const popup = view?.popup;

  if (!popup || !isAggregatePopupOpen(popup)) {
    return false;
  }

  if (typeof view?.closePopup === "function") {
    view.closePopup();
    return true;
  }

  popup.close?.();
  return true;
}

export function isAggregatePopupOpen(popup) {
  return getPopupCandidateFeatures(popup).some(isAggregatePopupFeature);
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
