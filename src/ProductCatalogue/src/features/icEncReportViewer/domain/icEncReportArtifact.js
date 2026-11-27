import { buildUrl } from "../../../shared/api/apiClient.js";

const guid = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
const artifactRoute = new RegExp(`(?:^|/)(electronicproducts/([^/?#]+)/artifacts/(${guid}))$`, "i");
const emptyGuid = "00000000-0000-0000-0000-000000000000";
const rootOrHttpUrl = /^(?:https?:\/\/|\/(?!\/))/i;

function foldOwner(name) {
  // ENC identifiers allow ASCII case-insensitive matching. Keep other code
  // points exact so an uppercase expansion cannot equate two different owners.
  return name.replace(/[a-z]/g, (character) => character.toUpperCase());
}

export function getIcEncReportArtifact(artifact, expectedDatasetName, selectedUrl) {
  if (
    artifact?.kind !== "IcEncReport" ||
    typeof artifact.fileName !== "string" ||
    !artifact.fileName.trim() ||
    typeof artifact.datasetName !== "string" ||
    typeof expectedDatasetName !== "string" ||
    !expectedDatasetName.trim() ||
    typeof artifact.id !== "string" ||
    artifact.id === emptyGuid ||
    typeof selectedUrl !== "string" ||
    selectedUrl !== artifact.url
  ) {
    return null;
  }
  const match = artifactRoute.exec(selectedUrl);
  if (!match || match[3].toLowerCase() !== artifact.id.toLowerCase()) return null;

  const [, path, encodedOwner] = match;
  const url = buildUrl(path);
  if (selectedUrl !== url || !rootOrHttpUrl.test(url) || /[\s\\]/u.test(url)) return null;

  // Artifact-history normalization rebases download URLs for existing callers.
  // The preview also checks the input route, before that rebasing can mask a bad prefix.
  const originalUrl = artifact.originalReportUrl;
  try {
    const apiUrl = new URL(url, "https://product-catalogue.invalid/");
    if (!["https:", "http:"].includes(apiUrl.protocol) || apiUrl.username || apiUrl.password)
      return null;
    if (![url, apiUrl.pathname, `/${path}`, path].includes(originalUrl)) return null;
    const owner = decodeURIComponent(encodedOwner);
    if (
      /[/%\\]/u.test(owner) ||
      [...owner].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
      ) ||
      owner === "." ||
      owner === ".." ||
      foldOwner(owner) !== foldOwner(expectedDatasetName) ||
      foldOwner(owner) !== foldOwner(artifact.datasetName)
    ) {
      return null;
    }
    return Object.freeze({
      id: artifact.id,
      datasetName: artifact.datasetName,
      fileName: artifact.fileName,
      kind: artifact.kind,
      originalReportUrl: originalUrl,
      url,
    });
  } catch {
    return null;
  }
}
