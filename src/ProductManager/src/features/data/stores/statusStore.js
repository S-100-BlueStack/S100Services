import { statusColorConfig } from "../../../shared/config/colorsConfig.js";
import { apiGet } from "../../../shared/api/apiClient.js";

const statusMap = new Map();

export async function loadStatuses() {
  const data = await apiGet("lookup/productstates", "Failed to load product states");

  data.forEach((state) => {
    statusMap.set(state.Id, state);
  });
}

export function getStatusColor(id) {
  return statusColorConfig[id];
}

export function getStatusName(id) {
  const normalizedId = normalizeStatusId(id);

  return statusMap.get(normalizedId)?.Name ?? id;
}

export function getStatus(id) {
  return statusMap.get(normalizeStatusId(id));
}

function normalizeStatusId(id) {
  const number = Number(id);

  return Number.isFinite(number) ? number : id;
}
