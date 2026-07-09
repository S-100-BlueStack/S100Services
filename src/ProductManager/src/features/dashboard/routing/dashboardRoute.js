import { createDashboardRange, getDefaultDashboardRangePreset } from "../domain/dashboardRange.js";

export function getCurrentDashboardRoute() {
  const params = new URLSearchParams(window.location.search || "");

  return {
    name: "dashboard",
    rangePreset: params.get("range") || params.get("preset") || getDefaultDashboardRangePreset(),
    from: params.get("from"),
    to: params.get("to"),
  };
}

export function buildDashboardUrl({ rangePreset, from = null, to = null } = {}) {
  const range = createDashboardRange(rangePreset, { from, to });
  const params = new URLSearchParams();
  const baseUrl = getBaseUrl();

  params.set("range", range.preset);

  if (range.preset === "custom" && range.fromQueryValue) {
    params.set("from", range.fromQueryValue);

    if (range.toQueryValue) {
      params.set("to", range.toQueryValue);
    }
  }

  return `${baseUrl}dashboard/?${params.toString()}`;
}

export function setDashboardRouteUrl(range, { replace = false } = {}) {
  const nextUrl = buildDashboardUrl({
    rangePreset: range.preset,
    from: range.fromQueryValue ?? range.fromIso,
    to: range.toQueryValue,
  });
  const method = replace ? "replaceState" : "pushState";

  window.history[method](
    {
      route: "dashboard",
      rangePreset: range.preset,
      from: range.fromQueryValue ?? range.fromIso,
      to: range.toQueryValue,
    },
    "",
    nextUrl
  );
}

export function createDashboardDocumentTitle() {
  return "Dashboard - Product Manager";
}

function getBaseUrl() {
  return String(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
}
