import { apiGet } from "../../../shared/api/apiClient.js";
import { normalizeDashboardPayload } from "../domain/dashboardActivity.js";
import { appendDashboardQueryParameters } from "../domain/dashboardQuery.js";

const DASHBOARD_ACTIVITY_ENDPOINT = "electronicproducts/dashboard";
const DASHBOARD_REQUEST_TIMEOUT_MS = 30_000;

export async function fetchDashboardActivity(range, queryState, { signal } = {}) {
  const payload = await apiGet(
    createDashboardActivityPath(range, queryState),
    "Dashboard activity request failed",
    {
      signal,
      timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
    }
  );

  return normalizeDashboardPayload(payload, range);
}

export function createDashboardActivityPath(range, queryState) {
  const params = new URLSearchParams();

  params.set("from", range.fromQueryValue ?? range.fromIso);

  if (range.toQueryValue) {
    params.set("to", range.toQueryValue);
  }

  appendDashboardQueryParameters(params, queryState);
  return `${DASHBOARD_ACTIVITY_ENDPOINT}?${params.toString()}`;
}
