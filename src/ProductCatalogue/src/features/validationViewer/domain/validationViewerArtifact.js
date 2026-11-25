import { buildUrl } from "../../../shared/api/apiClient.js";

const artifactRoute =
  /(?:^|\/)(electronicproducts\/([^/?#]+)\/artifacts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))$/i;
const internalKinds = new Set(["ValidationReport", "ValidationDiagnostic"]);

// The caller supplies an existing authorized download, not a guessed report URL.
// Recheck its identity and API origin before permitting a credentialed body read.
export function getValidationViewerArtifact(artifact, expectedDatasetName) {
  if (!artifact || typeof artifact.fileName !== "string" || !/\.vld$/i.test(artifact.fileName)) {
    return null;
  }
  if (artifact.kind != null && !internalKinds.has(artifact.kind)) return null;
  if (typeof artifact.url !== "string" || typeof artifact.id !== "string") return null;
  const match = artifact.url.match(artifactRoute);
  if (!match || match[3].toLowerCase() !== artifact.id.toLowerCase()) return null;
  const [, path, encodedName] = match;
  const url = buildUrl(path);
  // A server DTO can use an API-relative path; an already normalized URL must
  // match our configured API base exactly, including any deployment prefix.
  if (artifact.url !== url && artifact.url !== `/${path}` && artifact.url !== path) return null;
  let datasetName;
  try {
    datasetName = decodeURIComponent(encodedName);
  } catch {
    return null;
  }
  if (
    !datasetName.trim() ||
    [...datasetName].some((character) => {
      const code = character.charCodeAt(0);
      return character === "\\" || character === "/" || code <= 0x1f || code === 0x7f;
    }) ||
    [".", ".."].includes(datasetName)
  ) {
    return null;
  }
  for (const owner of [artifact.datasetName, expectedDatasetName]) {
    if (
      owner != null &&
      (typeof owner !== "string" || owner.trim().toUpperCase() !== datasetName.toUpperCase())
    ) {
      return null;
    }
  }
  return Object.freeze({
    id: artifact.id,
    fileName: artifact.fileName,
    url,
    datasetName,
    revisionId: artifact.revisionId ?? null,
    createdAtUtc: artifact.createdAtUtc ?? null,
    kind: artifact.kind ?? null,
  });
}
