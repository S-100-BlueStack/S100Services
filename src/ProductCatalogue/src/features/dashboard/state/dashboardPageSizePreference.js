import {
  readSavedPreferenceStatus,
  notifySavedPreferenceChanged,
} from "../../preferences/state/savedPreferenceStatus.js";
import {
  DASHBOARD_DEFAULT_PAGE_SIZE,
  normalizeDashboardPageSize,
} from "../domain/dashboardQuery.js";

export const DASHBOARD_PAGE_SIZE_STORAGE_KEY = "pc.dashboard.pageSize.v1";
const DASHBOARD_PAGE_SIZE_RESET_EVENT = "pc-dashboard-page-size-preference-reset";

export function readDashboardPageSizePreference(storage = getBrowserStorage()) {
  if (!storage) {
    return DASHBOARD_DEFAULT_PAGE_SIZE;
  }

  try {
    const storedValue = storage.getItem(DASHBOARD_PAGE_SIZE_STORAGE_KEY);
    return normalizeDashboardPageSize(storedValue);
  } catch (error) {
    console.warn("[Dashboard] Failed to read saved page size.", error);
    return DASHBOARD_DEFAULT_PAGE_SIZE;
  }
}

export function writeDashboardPageSizePreference(pageSize, storage = getBrowserStorage()) {
  const normalizedPageSize = normalizeDashboardPageSize(pageSize);
  if (!storage) {
    return normalizedPageSize;
  }

  try {
    storage.setItem(DASHBOARD_PAGE_SIZE_STORAGE_KEY, String(normalizedPageSize));
    notifySavedPreferenceChanged();
  } catch (error) {
    console.warn("[Dashboard] Failed to save page size.", error);
  }

  return normalizedPageSize;
}

export function resetDashboardPageSizePreference(storage = getBrowserStorage()) {
  try {
    storage?.removeItem(DASHBOARD_PAGE_SIZE_STORAGE_KEY);
    notifySavedPreferenceChanged();
  } catch (error) {
    console.warn("[Dashboard] Failed to clear saved page size.", error);
  }

  dispatchDashboardPageSizePreferenceReset();
  return DASHBOARD_DEFAULT_PAGE_SIZE;
}

export function onDashboardPageSizePreferenceReset(callback) {
  if (typeof document === "undefined" || typeof callback !== "function") {
    return { remove() {} };
  }

  const handler = (event) => callback(event.detail);
  document.addEventListener(DASHBOARD_PAGE_SIZE_RESET_EVENT, handler);

  return {
    remove() {
      document.removeEventListener(DASHBOARD_PAGE_SIZE_RESET_EVENT, handler);
    },
  };
}

function dispatchDashboardPageSizePreferenceReset() {
  if (typeof document === "undefined" || typeof CustomEvent === "undefined") {
    return;
  }

  document.dispatchEvent(
    new CustomEvent(DASHBOARD_PAGE_SIZE_RESET_EVENT, {
      detail: { pageSize: DASHBOARD_DEFAULT_PAGE_SIZE },
    })
  );
}

function getBrowserStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function getSavedDashboardPageSizeStatus() {
  return readSavedPreferenceStatus(DASHBOARD_PAGE_SIZE_STORAGE_KEY, (value) =>
    ["25", "50", "100", "200"].includes(value)
      ? `Saved: ${value} rows`
      : "Saved value invalid (default: 50)"
  );
}
