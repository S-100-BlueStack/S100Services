import { normalizePackageGeometry } from "./packageGeometry.js";

export function normalizePackageAoiItem(value) {
  if (!value || typeof value.packageId !== "string" || !value.packageId.trim()) {
    throw new Error("API returned a Package AOI without a Package identifier.");
  }
  if (value.shortId != null && typeof value.shortId !== "string") {
    throw new Error("API returned an invalid Package short ID.");
  }
  if (value.aoi == null) {
    throw new Error(`Package ${value.packageId} does not have an AOI to display.`);
  }

  // The overview never fetches detailed coordinates. Reuse the verified Esri
  // polygon normalizer instead of accepting unvalidated geometry in MapView.
  const { aoi } = normalizePackageGeometry({ aoi: value.aoi, detailedGeometry: null });
  return { id: value.packageId, packageId: value.packageId, shortId: value.shortId ?? null, aoi };
}
