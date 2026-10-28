import {
  buildWorkspaceUrl,
  normalizeWorkspaceDatasetNames,
  parseWorkspaceRoute,
  setWorkspaceRouteUrl,
} from "../../../shared/routing/workspaceRoute.js";

export function getCurrentReviewRoute() {
  const route = parseWorkspaceRoute(window.location.href);
  return route?.name === "review" ? route : { name: "review", datasetNames: [] };
}

export function buildReviewUrl(datasetNames) {
  return buildWorkspaceUrl("review", datasetNames);
}

export function setReviewRouteUrl(datasetNames, options) {
  return setWorkspaceRouteUrl("review", datasetNames, options);
}

export function createReviewDocumentTitle(datasetNames) {
  const names = normalizeWorkspaceDatasetNames("review", datasetNames);

  if (names.length === 0) {
    return "Product Review - Product Catalogue";
  }

  if (names.length === 1) {
    return `Review ${names[0]} - Product Catalogue`;
  }

  return `Review ${names.length} products - Product Catalogue`;
}
