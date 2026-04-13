import { apiGet } from "../../../shared/api/apiClient.js";

const usageMap = new Map();

export async function loadUsages() {
  const data = await apiGet("specificusages", "Failed to load specific usages");

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
