import { apiGet } from "../../../shared/api/apiClient.js";

const ANALYZE_PRODUCT_ENDPOINT = "electronicproducts";
const USE_MOCK_ANALYZE_API = import.meta.env.DEV && false;

export async function fetchAnalyzeProducts(datasetNames) {
  const uniqueDatasetNames = [...new Set(datasetNames)];

  return await Promise.all(
    uniqueDatasetNames.map((datasetName) => fetchAnalyzeProduct(datasetName))
  );
}

async function fetchAnalyzeProduct(datasetName) {
  if (USE_MOCK_ANALYZE_API) {
    return normalizeAnalyzeProduct(createMockAnalyzeProduct(datasetName), datasetName, {
      isMock: true,
    });
  }

  try {
    const payload = await apiGet(
      `${ANALYZE_PRODUCT_ENDPOINT}/${encodeURIComponent(datasetName)}`,
      `Analyze data request failed for ${datasetName}`
    );

    return normalizeAnalyzeProduct(payload, datasetName);
  } catch (error) {
    return normalizeAnalyzeProduct(createMockAnalyzeProduct(datasetName), datasetName, {
      isMock: true,
      loadError: error instanceof Error ? error.message : "Unknown analyze data error",
    });
  }
}

function normalizeAnalyzeProduct(
  payload,
  requestedDatasetName,
  { isMock = false, loadError = null } = {}
) {
  const product = getAnalyzeProductPayload(payload);
  const datasetName =
    readFirstDefined(product, ["datasetName", "DatasetName", "name", "Name"]) ??
    requestedDatasetName;

  return {
    datasetName,
    name: datasetName,

    status: normalizeStatus(
      readFirstDefined(product, ["status", "Status", "productState", "ProductState"]) ?? 4
    ),

    edition: readFirstDefined(product, ["edition", "Edition"]) ?? "-",
    update: readFirstDefined(product, ["update", "Update", "updateNumber", "UpdateNumber"]) ?? "-",
    usageBand: readFirstDefined(product, ["usageBand", "UsageBand"]) ?? "-",
    issueDate: readFirstDefined(product, ["issueDate", "IssueDate"]) ?? "-",

    // Only read the top-level product error message. Do not read Data.Exports[*].
    errorMessage: readFirstDefined(product, ["errorMessage", "ErrorMessage"]) ?? "",

    // These are optional. Current backend response may not include them.
    aoiGeometry:
      readFirstDefined(product, ["aoiGeometry", "AoiGeometry", "aoi", "Aoi", "AOI"]) ?? null,

    xml: readFirstDefined(product, ["xml", "Xml", "XML", "reportXml", "ReportXml"]) ?? null,

    raw: payload,
    isMock,
    loadError,
  };
}

function getAnalyzeProductPayload(payload) {
  const data = payload?.Data ?? payload?.data;

  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data;
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload;
  }

  return {};
}

function readFirstDefined(source, keys) {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  for (const key of keys) {
    if (Object.hasOwn(source, key) && source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }

  return undefined;
}

function normalizeStatus(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : value;
}

function createMockAnalyzeProduct(datasetName) {
  const geometry = createMockAoiGeometry(datasetName);

  return {
    Data: {
      Name: datasetName,
      Status: 4,
      Edition: 1,
      Update: 0,
      UsageBand: 1,
      IssueDate: "2026-05-29",
      ErrorMessage:
        "Demo IC-ENC rejection message. Replace this when the backend report payload is ready.",
      Aoi: JSON.stringify(geometry),
      Xml: createMockXml(datasetName),
      Exports: [
        {
          Type: "S-57",
          Name: datasetName,
          Edition: 1,
          Update: 0,
          Status: 4,
          Date: "2026-05-29T00:00:00",
          ErrorMessage: null,
        },
      ],
    },
    Success: true,
    Message: null,
    TotalHits: 1,
  };
}

function createMockAoiGeometry(datasetName) {
  const hash = [...datasetName].reduce((value, character) => {
    return (value * 31 + character.charCodeAt(0)) >>> 0;
  }, 17);

  const centerX = 9.5 + (hash % 180) / 100;
  const centerY = 55.0 + ((hash >> 8) % 120) / 100;
  const size = 0.12;

  return {
    rings: [
      [
        [centerX - size, centerY - size],
        [centerX + size, centerY - size],
        [centerX + size, centerY + size],
        [centerX - size, centerY + size],
        [centerX - size, centerY - size],
      ],
    ],
    spatialReference: { wkid: 4326 },
  };
}

function createMockXml(datasetName) {
  const escapedDatasetName = escapeXml(datasetName);

  return `<?xml version="1.0" encoding="UTF-8"?>
<ICENCReport>
  <DatasetName>${escapedDatasetName}</DatasetName>
  <Status>Rejected</Status>
  <Message>Mock IC-ENC report. Replace this with the XML returned by the backend.</Message>
</ICENCReport>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
