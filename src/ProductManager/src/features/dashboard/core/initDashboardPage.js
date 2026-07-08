import { noticeError } from "../../notices/services/noticeService.js";
import { fetchDashboardActivity } from "../api/dashboardApi.js";
import { createDashboardRange } from "../domain/dashboardRange.js";
import {
  createDashboardDocumentTitle,
  getCurrentDashboardRoute,
  setDashboardRouteUrl,
} from "../routing/dashboardRoute.js";
import { renderDashboardPage } from "../ui/dashboardPage.js";

export async function initDashboardPage({ rangePreset, from, to } = {}) {
  let currentRange = createDashboardRange(rangePreset, { from, to });
  let currentDashboard = null;
  let loadRequestId = 0;

  document.body.classList.add("pm-dashboard-route");
  document.title = createDashboardDocumentTitle(currentRange);

  const loadDashboard = async (nextRange, { updateUrl = true } = {}) => {
    const requestId = ++loadRequestId;
    currentRange = nextRange;

    if (updateUrl) {
      setDashboardRouteUrl(currentRange);
    }

    document.title = createDashboardDocumentTitle(currentRange);

    renderDashboardPage({
      range: currentRange,
      dashboard: currentDashboard,
      loading: true,
    });

    try {
      const dashboard = await fetchDashboardActivity(currentRange);

      if (requestId !== loadRequestId) {
        return;
      }

      currentDashboard = dashboard;
      renderDashboardPage({
        range: currentRange,
        dashboard,
        loading: false,
      });
    } catch (error) {
      if (requestId !== loadRequestId) {
        return;
      }

      const message = error instanceof Error ? error.message : "Unknown dashboard error.";
      currentDashboard = null;
      renderDashboardPage({
        range: currentRange,
        dashboard: null,
        loading: false,
        error: message,
      });
      noticeError("Dashboard failed", message);
    }
  };

  const handleRangeChange = async (event) => {
    const preset = event.detail?.preset;

    if (!preset) {
      return;
    }

    await loadDashboard(createDashboardRange(preset), { updateUrl: true });
  };

  const handleRefresh = async () => {
    await loadDashboard(currentRange, { updateUrl: false });
  };

  const handlePopState = async () => {
    const route = getCurrentDashboardRoute();
    await loadDashboard(
      createDashboardRange(route.rangePreset, {
        from: route.from,
        to: route.to,
      }),
      { updateUrl: false }
    );
  };

  document.addEventListener("pm-dashboard-range-change", handleRangeChange);
  document.addEventListener("pm-dashboard-refresh", handleRefresh);
  window.addEventListener("popstate", handlePopState);

  renderDashboardPage({
    range: currentRange,
    dashboard: null,
    loading: false,
  });

  await loadDashboard(currentRange, { updateUrl: false });

  return {
    get range() {
      return currentRange;
    },
    get dashboard() {
      return currentDashboard;
    },
    refresh() {
      return loadDashboard(currentRange, { updateUrl: false });
    },
    destroy() {
      loadRequestId += 1;
      document.removeEventListener("pm-dashboard-range-change", handleRangeChange);
      document.removeEventListener("pm-dashboard-refresh", handleRefresh);
      window.removeEventListener("popstate", handlePopState);
      document.body.classList.remove("pm-dashboard-route");
    },
  };
}
