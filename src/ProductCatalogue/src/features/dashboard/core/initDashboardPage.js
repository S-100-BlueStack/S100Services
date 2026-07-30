import { noticeError } from "../../notices/services/noticeService.js";
import { fetchDashboardActivity } from "../api/dashboardApi.js";
import {
  createDefaultDashboardFilters,
  normalizeDashboardFilters,
} from "../domain/dashboardFilters.js";
import {
  createDashboardPagingState,
  createDashboardQueryState,
  moveDashboardPage,
  resetDashboardPaging,
} from "../domain/dashboardQuery.js";
import { createDashboardRange } from "../domain/dashboardRange.js";
import {
  createDashboardDocumentTitle,
  getCurrentDashboardRoute,
  setDashboardRouteUrl,
} from "../routing/dashboardRoute.js";
import { renderDashboardPage } from "../ui/dashboardPage.js";

const SEARCH_DEBOUNCE_MS = 300;

export async function initDashboardPage({ rangePreset, from, to } = {}) {
  let currentRange = createDashboardRange(rangePreset, { from, to });
  let currentDashboard = null;
  let currentFilters = createDefaultDashboardFilters();
  let pagingState = createDashboardPagingState();
  let loadRequestId = 0;
  const activeRequestControllers = new Set();
  let searchDebounceId = null;

  document.body.classList.add("pc-dashboard-route");
  document.title = createDashboardDocumentTitle(currentRange);

  const render = ({ loading = false, error = null } = {}) => {
    renderDashboardPage({
      range: currentRange,
      dashboard: currentDashboard,
      filters: currentFilters,
      loading,
      error,
      pageNumber: pagingState.cursorHistory.length + 1,
      canGoPrevious: pagingState.cursorHistory.length > 0,
    });
  };

  const abortActiveRequests = () => {
    for (const controller of activeRequestControllers) {
      controller.abort();
    }

    activeRequestControllers.clear();
  };

  const loadDashboard = async (
    nextRange,
    { updateUrl = true, resetPage = false, abortPrevious = true } = {}
  ) => {
    const requestId = ++loadRequestId;
    currentRange = nextRange;

    if (resetPage) {
      pagingState = resetDashboardPaging();
    }

    if (abortPrevious) {
      abortActiveRequests();
    }

    const requestController = new AbortController();
    activeRequestControllers.add(requestController);

    if (updateUrl) {
      setDashboardRouteUrl(currentRange);
    }

    document.title = createDashboardDocumentTitle(currentRange);
    render({ loading: true });

    try {
      const dashboard = await fetchDashboardActivity(
        currentRange,
        createDashboardQueryState({
          filters: currentFilters,
          cursor: pagingState.cursor,
        }),
        { signal: requestController.signal }
      );

      if (requestId !== loadRequestId || requestController.signal.aborted) {
        return { status: "cancelled" };
      }

      currentDashboard = dashboard;
      currentFilters = normalizeDashboardFilters(currentFilters, dashboard.filterOptions);
      render();
      return { status: "succeeded" };
    } catch (error) {
      if (requestId !== loadRequestId || requestController.signal.aborted) {
        return { status: "cancelled" };
      }

      const message = error instanceof Error ? error.message : "Unknown dashboard error.";
      render({ error: message });
      noticeError("Dashboard failed", message);
      return { status: "failed", message };
    } finally {
      activeRequestControllers.delete(requestController);
    }
  };

  const handleRangeChange = async (event) => {
    const preset = event.detail?.preset;

    if (!preset) {
      return;
    }

    await loadDashboard(
      createDashboardRange(preset, {
        from: event.detail?.from,
        to: event.detail?.to,
      }),
      { updateUrl: true, resetPage: true }
    );
  };

  const handleFilterChange = (event) => {
    const debounce = Boolean(event.detail?.debounce);
    currentFilters = normalizeDashboardFilters(event.detail?.filters ?? currentFilters);
    pagingState = resetDashboardPaging();
    loadRequestId += 1;

    if (!debounce) {
      abortActiveRequests();
    }

    if (searchDebounceId !== null) {
      window.clearTimeout(searchDebounceId);
      searchDebounceId = null;
    }

    const execute = () => {
      searchDebounceId = null;
      void loadDashboard(currentRange, {
        updateUrl: false,
        abortPrevious: !debounce,
      });
    };

    if (debounce) {
      searchDebounceId = window.setTimeout(execute, SEARCH_DEBOUNCE_MS);
    } else {
      execute();
    }
  };

  const handlePageChange = async (event) => {
    if (searchDebounceId !== null) {
      return;
    }

    const direction = event.detail?.direction;
    const nextPagingState = moveDashboardPage(pagingState, currentDashboard?.paging, direction);

    if (
      nextPagingState.cursor === pagingState.cursor &&
      nextPagingState.cursorHistory.length === pagingState.cursorHistory.length
    ) {
      return;
    }

    const previousPagingState = pagingState;
    pagingState = nextPagingState;
    const result = await loadDashboard(currentRange, { updateUrl: false });

    if (result?.status === "failed" && pagingState === nextPagingState) {
      pagingState = previousPagingState;
      render({ error: result.message });
    }
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
      { updateUrl: false, resetPage: true }
    );
  };

  document.addEventListener("pc-dashboard-range-change", handleRangeChange);
  document.addEventListener("pc-dashboard-filter-change", handleFilterChange);
  document.addEventListener("pc-dashboard-page-change", handlePageChange);
  document.addEventListener("pc-dashboard-refresh", handleRefresh);
  window.addEventListener("popstate", handlePopState);

  render();
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
      abortActiveRequests();

      if (searchDebounceId !== null) {
        window.clearTimeout(searchDebounceId);
      }

      document.removeEventListener("pc-dashboard-range-change", handleRangeChange);
      document.removeEventListener("pc-dashboard-filter-change", handleFilterChange);
      document.removeEventListener("pc-dashboard-page-change", handlePageChange);
      document.removeEventListener("pc-dashboard-refresh", handleRefresh);
      window.removeEventListener("popstate", handlePopState);
      document.body.classList.remove("pc-dashboard-route");
    },
  };
}
