import { statusColorConfig } from "../../../shared/config/colorsConfig.js";
import { apiRequest } from "../../../shared/api/apiClient.js";

const statusMap = new Map();

export async function loadStatuses() {
  const result = await apiRequest("productstates");

  if (!result.success) {
    throw new Error(getStoreErrorMessage("product states", result));
  }

  const data = Array.isArray(result.data) ? result.data : [];

  statusMap.clear();

  data.forEach((state) => {
    statusMap.set(state.Id, state);
  });
}

export function getStatusName(id) {
  return statusMap.get(id)?.Name ?? id;
}

export function getStatusColor(id) {
  return statusColorConfig[id];
}

export function getStatus(id) {
  return statusMap.get(id);
}

function getStoreErrorMessage(resourceName, result) {
  if (result.isUnauthorized) {
    return `Unauthorized while loading ${resourceName}`;
  }

  if (result.isForbidden) {
    return `Forbidden while loading ${resourceName}`;
  }

  if (result.networkError) {
    return `Network error while loading ${resourceName}: ${result.errorMessage}`;
  }

  return `Failed to load ${resourceName}${result.status ? ` (${result.status})` : ""}`;
}
