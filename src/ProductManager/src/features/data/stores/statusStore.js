import { statusColorConfig } from "../../../shared/config/colorsConfig.js";
import { apiGet } from "../../../shared/api/apiClient.js";

const statusMap = new Map();

export async function loadStatuses() {
  const data = await apiGet("lookup/productstates", "Failed to load product states");

  statusMap.clear();

  data.forEach((state) => {
    statusMap.set(normalizeStatusId(state.Id), state);
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

export function getAllStatuses() {
  return Array.from(statusMap.values()).sort((left, right) => {
    const leftId = normalizeStatusId(left.Id);
    const rightId = normalizeStatusId(right.Id);

    if (typeof leftId === "number" && typeof rightId === "number") {
      return leftId - rightId;
    }

    return String(left.Name ?? left.Id).localeCompare(String(right.Name ?? right.Id));
  });
}

export function getStatusIdByName(name) {
  const normalizedName = normalizeStatusName(name);

  for (const [id, status] of statusMap.entries()) {
    if (normalizeStatusName(status?.Name) === normalizedName) {
      return id;
    }
  }

  return null;
}

export function isFrozenStatus(id) {
  const name = normalizeStatusName(getStatusName(id));

  return (
    name === "frozen" ||
    name === "in transit" // TODO: Remove this when backend returns Frozen.
  );
}

function normalizeStatusId(id) {
  const number = Number(id);

  return Number.isFinite(number) ? number : id;
}

function normalizeStatusName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
