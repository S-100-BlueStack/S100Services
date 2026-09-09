import { parseWorkspaceRoute } from "../../shared/routing/workspaceRoute.js";

export function getCurrentRoute() {
  const pathname = getPathnameWithoutBase(window.location.pathname);

  const dashboardMatch = pathname.match(/^\/dashboard\/?$/i);
  if (dashboardMatch) {
    return {
      name: "dashboard",
      ...parseDashboardSearch(window.location.search),
    };
  }

  const workspaceRoute = parseWorkspaceRoute(window.location.href);
  if (workspaceRoute) return workspaceRoute;

  return { name: "main" };
}

function parseDashboardSearch(search) {
  const params = new URLSearchParams(search || "");

  return {
    rangePreset: params.get("range") || params.get("preset") || "since-yesterday",
    from: params.get("from"),
    to: params.get("to"),
  };
}

function getPathnameWithoutBase(pathname) {
  const basePath = getBasePath();

  if (basePath && pathname.startsWith(basePath)) {
    return pathname.slice(basePath.length) || "/";
  }

  return pathname || "/";
}

function getBasePath() {
  const baseUrl = getBaseUrl();
  const basePath = new URL(baseUrl, window.location.origin).pathname;

  return basePath === "/" ? "" : basePath.replace(/\/+$/, "");
}

function getBaseUrl() {
  return String(import.meta.env?.BASE_URL || "/").replace(/\/?$/, "/");
}
