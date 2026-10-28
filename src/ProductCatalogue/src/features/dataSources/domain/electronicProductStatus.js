// ProductState wire IDs are mapped explicitly to the ProductStatus palette IDs.
// Both enums are numeric in the API contract at baseline 5fedc0f0; package lifecycle
// IDs belong to a different enum and must never pass through this boundary.
const PRODUCT_STATE_TO_STATUS = new Map([
  [1, 1], // Idle
  [2, 2], // Exported
  [5, 5], // Frozen
  [6, 6], // InTransit
  [7, 7], // Rejected
  [8, 8], // ChangesDetected
  [9, 9], // Exporting
  [10, 10], // Validating
  [11, 11], // ReadyForDistribution
  [12, 12], // AcceptedForDistribution
  [13, 13], // Published
  [14, 14], // Cancelled
  [15, 15], // Error
]);

export function normalizeElectronicProductStatus(value) {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) return undefined;
  return PRODUCT_STATE_TO_STATUS.get(Number(value));
}
