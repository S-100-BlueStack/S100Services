import { apiRequest } from "../../../shared/api/apiClient.js";

const usageMap = new Map();

export async function loadUsages() {
  const result = await apiRequest("specificusages");

  if (!result.success) {
    throw new Error(getStoreErrorMessage("specific usages", result));
  }

  const data = Array.isArray(result.data) ? result.data : [];

  usageMap.clear();

  data.forEach((usage) => {
    usageMap.set(usage.Id, usage);
  });
}

export function getUsageName(id) {
  return usageMap.get(id)?.Name ?? id;
}

export function getUsage(id) {
  return usageMap.get(id);
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
