import { apiGet } from "../../../shared/api/apiClient.js";
import { createDemoDashboardPayload } from "../data/demoDashboardData.js";
import { normalizeDashboardPayload } from "../domain/dashboardActivity.js";

const DASHBOARD_ACTIVITY_ENDPOINT = "productmanager/dashboard/activity";

export async function fetchDashboardActivity(range) {
  try {
    const payload = await apiGet(
      createDashboardActivityPath(range),
      "Dashboard activity request failed"
    );

    return normalizeDashboardPayload(payload, range);
  } catch (error) {
    return normalizeDashboardPayload(createDemoDashboardPayload(range), range, {
      isDemo: true,
      loadError: error instanceof Error ? error.message : "Unknown dashboard activity error.",
    });
  }
}

function createDashboardActivityPath(range) {
  const params = new URLSearchParams();

  params.set("from", range.fromIso);
  params.set("to", range.toIso);
  params.set("range", range.preset);

  return `${DASHBOARD_ACTIVITY_ENDPOINT}?${params.toString()}`;
}
