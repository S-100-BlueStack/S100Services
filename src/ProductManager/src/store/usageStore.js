const usageMap = new Map();
const API_BASE_URL = "https://localhost:7271/";

export async function loadUsages() {
  const response = await fetch(`${API_BASE_URL}specificusages`);

  if (!response.ok) {
    throw new Error("Failed to load specific usages");
  }

  const data = await response.json();

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
