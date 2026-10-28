import { apiGet } from "../../../shared/api/apiClient.js";

const usageMap = new Map();

export async function loadUsages() {
  const data = await apiGet("lookup/specificusages", "Failed to load specific usages");

  usageMap.clear();

  data.forEach((usage) => {
    usageMap.set(normalizeUsageId(usage.Id), usage);
  });
}

export function getUsageName(id) {
  const normalizedId = normalizeUsageId(id);

  return usageMap.get(normalizedId)?.Name ?? id;
}

export function getUsage(id) {
  return usageMap.get(normalizeUsageId(id));
}

export function getAllUsages() {
  return Array.from(usageMap.values()).sort((left, right) => {
    const leftId = normalizeUsageId(left.Id);
    const rightId = normalizeUsageId(right.Id);

    if (typeof leftId === "number" && typeof rightId === "number") {
      return leftId - rightId;
    }

    return String(left.Name ?? left.Id).localeCompare(String(right.Name ?? right.Id));
  });
}

function normalizeUsageId(id) {
  const number = Number(id);

  return Number.isFinite(number) ? number : id;
}
