// The API uses EncPackageStatus, not ProductState. These IDs must never use the Product palette.
export const ENC_PACKAGE_STATUSES = Object.freeze([
  Object.freeze({ id: 0, label: "Idle" }),
  Object.freeze({ id: 2, label: "Ready" }),
  Object.freeze({ id: 3, label: "InTransit" }),
  Object.freeze({ id: 4, label: "Error" }),
  Object.freeze({ id: 5, label: "Hold" }),
]);

const byId = new Map(ENC_PACKAGE_STATUSES.map((status) => [status.id, status]));
const byName = new Map(ENC_PACKAGE_STATUSES.map((status) => [status.label.toLowerCase(), status]));

export function normalizeEncPackageStatus(value) {
  if (typeof value === "number" && Number.isInteger(value)) return byId.get(value)?.id;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const token = value.trim();
  if (/^\d+$/.test(token)) return byId.get(Number(token))?.id;
  return byName.get(token.toLowerCase())?.id;
}

export function getEncPackageStatusLabel(value) {
  return byId.get(normalizeEncPackageStatus(value))?.label ?? "Unknown";
}

// Unknown statuses remain distinguishable from Idle and cannot match an unrelated member status.
export function readEncPackageStatusFilterValues(graphic) {
  const value = normalizeEncPackageStatus(graphic?.attributes?.workUnitStatus?.packageStatus);
  return [value === undefined ? "unknown" : String(value)];
}
