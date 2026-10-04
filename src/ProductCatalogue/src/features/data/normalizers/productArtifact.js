import { buildUrl } from "../../../shared/api/apiClient.js";

export function normalizeProductArtifact(value) {
  if (!value || typeof value !== "object") return null;
  const read = (name) => value[name] ?? value[name[0].toUpperCase() + name.slice(1)];
  const rawUrl = String(read("url") ?? "").trim();
  // Only the public artifact route is downloadable. Rebase API-relative paths once.
  const match = rawUrl.match(/(?:^|\/)electronicproducts\/[^/?#]+\/artifacts\/[0-9a-f-]{36}$/i);
  if (!match || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(rawUrl)) return null;
  const path = match[0].replace(/^\//, "");
  return {
    id: read("id"),
    fileName: read("fileName"),
    mediaType: read("mediaType"),
    createdAtUtc: read("createdAtUtc"),
    url: buildUrl(path),
  };
}

export function normalizeArtifactHistory(payload) {
  const values = payload?.Data ?? payload?.data ?? payload;
  if (!Array.isArray(values)) throw new Error("Invalid validation artifact history response.");
  return values
    .map((value) => {
      const artifact = normalizeProductArtifact(value);
      if (!artifact) return null;
      const specification = value.ProductSpecification ?? value.productSpecification;
      return {
        ...artifact,
        trackId: value.TrackId ?? value.trackId,
        revisionId: value.RevisionId ?? value.revisionId,
        datasetName: value.DatasetName ?? value.datasetName,
        productSpecification: specification,
        productSpecificationLabel: { S57: "S-57", S101: "S-101" }[specification] ?? specification,
        kind: value.Kind ?? value.kind,
      };
    })
    .filter(Boolean);
}
