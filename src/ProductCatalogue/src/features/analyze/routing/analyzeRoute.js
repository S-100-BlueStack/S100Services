import {
  buildWorkspaceUrl,
  getWorkspaceBaseUrl,
  normalizeWorkspaceDatasetNames,
  parseWorkspaceRoute,
  setWorkspaceRouteUrl,
} from "../../../shared/routing/workspaceRoute.js";

export function getCurrentRoute() {
  const route = parseWorkspaceRoute(window.location.href);
  return route?.name === "analyze" ? route : { name: "main" };
}

export function buildAnalyzeUrl(datasetNames) {
  return buildWorkspaceUrl("analyze", datasetNames);
}

export function setAnalyzeRouteUrl(datasetNames, options) {
  return setWorkspaceRouteUrl("analyze", datasetNames, options);
}

export function getAppHomeUrl() {
  return getWorkspaceBaseUrl();
}

export function createAnalyzeDocumentTitle(datasetNames) {
  const names = normalizeWorkspaceDatasetNames("analyze", datasetNames);

  if (names.length === 0) {
    return "Analyze - Product Catalogue";
  }

  if (names.length === 1) {
    return `Analyze ${names[0]} - Product Catalogue`;
  }

  return `Analyze ${names.length} products - Product Catalogue`;
}
