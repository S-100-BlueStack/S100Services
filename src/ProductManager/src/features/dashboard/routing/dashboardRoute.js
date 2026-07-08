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

  if (range.preset === "custom" && range.fromIso && range.toIso) {
    params.set("from", range.fromIso);
    params.set("to", range.toIso);
  }

  return `${baseUrl}dashboard/?${params.toString()}`;
}

export function setDashboardRouteUrl(range, { replace = false } = {}) {
  const nextUrl = buildDashboardUrl({
    rangePreset: range.preset,
    from: range.fromIso,
    to: range.toIso,
  });
  const method = replace ? "replaceState" : "pushState";

  window.history[method](
    {
      route: "dashboard",
      rangePreset: range.preset,
      from: range.fromIso,
      to: range.toIso,
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
