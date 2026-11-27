import { normalizeSeverity } from "../../shared/domain/severity.js";

const ARCHIVE_ONLY = new Set(["ENC", "Landdata", "CoastAndRock"]);
const HTML_ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

export function manualPackageCategories(categories) {
  // Mirrors ChartSubmissionArchive.Supports, which compares exact category IDs.
  return categories.filter(({ id }) => !ARCHIVE_ONLY.has(id));
}

function isAbsoluteUri(value) {
  if (!value || /^\s|\s$|\p{Cc}/u.test(value)) return false;
  // System.Uri also accepts rooted DOS and UNC paths as absolute file references.
  if (/^(?:[a-z]:[\\/][^\\/]|\\\\[^\\]+\\[^\\])/i.test(value)) return true;
  try {
    const uri = new URL(value);
    return (
      !["http:", "https:", "ftp:"].includes(uri.protocol) ||
      (/^[a-z]+:\/\/[^/\\\s]/i.test(value) && !value.includes("\\"))
    );
  } catch {
    return false;
  }
}

export function createPackageRequest(fields, categories, aoi) {
  if (!categories.some(({ id }) => id === fields.category)) {
    throw new Error("Select a category that accepts manual creation.");
  }
  if (!isAbsoluteUri(fields.absoluteUri)) {
    throw new Error(
      "Enter a real absolute Source URI. Enter the case or reference number separately."
    );
  }
  if (!aoi) throw new Error("Draw at least one valid AOI area before creating the Package.");

  const request = {
    category: fields.category,
    absoluteUri: fields.absoluteUri,
    esriJSON: JSON.stringify(aoi),
  };
  if (fields.priority === "highest") request.severity = "0";
  if (fields.priority === "custom") {
    if (!/^\d+$/.test(fields.severity ?? "")) {
      throw new Error("Severity must contain decimal digits only.");
    }
    request.severity = normalizeSeverity(fields.severity.replace(/^0+(?=\d)/, ""));
  }
  const metaData = {};
  for (const key of ["title", "type", "source", "refId"]) {
    if (fields[key]?.trim()) metaData[key] = fields[key];
  }
  if (Object.keys(metaData).length) request.metaData = metaData;
  const language =
    fields.descriptionLanguage === "other" ? fields.language?.trim() : fields.descriptionLanguage;
  if (fields.descriptionLanguage === "other" && !language) {
    throw new Error("Enter a language code for Other.");
  }
  if (language && !fields.description?.trim()) {
    throw new Error("Enter a description for the selected description language.");
  }
  if (fields.description?.trim()) {
    // Descriptions are HTML in the API. Encode plain text for existing readers.
    request.descriptions = [
      {
        ...(language ? { language } : {}),
        description: fields.description.replace(/[&<>]/g, (character) => HTML_ENTITIES[character]),
      },
    ];
  }
  return request;
}
