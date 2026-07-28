import {
  DASHBOARD_FILTER_ANY,
  createDefaultDashboardFilters,
  normalizeDashboardFilters,
} from "./dashboardFilters.js";

export const DASHBOARD_PAGE_SIZE = 50;

export function createDashboardQueryState({ filters, cursor = null } = {}) {
  return {
    filters: normalizeDashboardFilters(filters ?? createDefaultDashboardFilters()),
    cursor: normalizeCursor(cursor),
    pageSize: DASHBOARD_PAGE_SIZE,
  };
}

export function appendDashboardQueryParameters(params, queryState) {
  const state = createDashboardQueryState(queryState);
  const { filters } = state;

  appendOptional(params, "search", filters.search);
  appendFilter(params, "product", filters.product);
  appendFilter(params, "type", filters.type);
  appendFilter(params, "status", filters.status);
  appendFilter(params, "importance", filters.importance);
  appendFilter(params, "reports", filters.reports);
  params.set("pageSize", String(state.pageSize));
  appendOptional(params, "cursor", state.cursor);

  return params;
}

export function createDashboardPagingState({ cursor = null, cursorHistory = [] } = {}) {
  return {
    cursor: normalizeCursor(cursor),
    cursorHistory: Array.isArray(cursorHistory) ? cursorHistory.map(normalizeCursor) : [],
  };
}

export function moveDashboardPage(pagingState, dashboardPaging, direction) {
  const current = createDashboardPagingState(pagingState);

  if (direction === "next") {
    const nextCursor = normalizeCursor(dashboardPaging?.nextCursor);
    if (!nextCursor) {
      return current;
    }

    return {
      cursor: nextCursor,
      cursorHistory: [...current.cursorHistory, current.cursor],
    };
  }

  if (direction === "previous" && current.cursorHistory.length > 0) {
    return {
      cursor: current.cursorHistory.at(-1) ?? null,
      cursorHistory: current.cursorHistory.slice(0, -1),
    };
  }

  return current;
}

export function resetDashboardPaging() {
  return createDashboardPagingState();
}

function appendFilter(params, key, value) {
  if (value && value !== DASHBOARD_FILTER_ANY) {
    params.set(key, value);
  }
}

function appendOptional(params, key, value) {
  const normalized = String(value ?? "").trim();
  if (normalized) {
    params.set(key, normalized);
  }
}

function normalizeCursor(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
