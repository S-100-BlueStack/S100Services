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
  const data = payload?.Data ?? payload?.data ?? {};

  return {
    datasetName:
      payload?.DatasetName ??
      payload?.datasetName ??
      data?.DatasetName ??
      data?.datasetName ??
      requestedDatasetName,

    status: normalizeStatus(
      payload?.Status ??
        payload?.status ??
        payload?.ProductStateId ??
        payload?.productStateId ??
        data?.Status ??
        data?.status ??
        4
    ),

    edition: payload?.Edition ?? payload?.edition ?? data?.Edition ?? data?.edition ?? "-",
    update: payload?.Update ?? payload?.update ?? data?.Update ?? data?.update ?? "-",

    errorMessage:
      payload?.ErrorMessage ??
      payload?.errorMessage ??
      payload?.Message ??
      payload?.message ??
      data?.ErrorMessage ??
      data?.errorMessage ??
      loadError ??
      "",

    aoiGeometry:
      data?.Aoi ?? data?.AOI ?? data?.aoi ?? payload?.Aoi ?? payload?.AOI ?? payload?.aoi ?? null,

    xml:
      data?.Xml ??
      data?.XML ??
      data?.xml ??
      data?.ReportXml ??
      data?.reportXml ??
      payload?.Xml ??
      payload?.XML ??
      payload?.xml ??
      payload?.ReportXml ??
      payload?.reportXml ??
      null,

    raw: payload,
    isMock,
    loadError,
  };
}

function normalizeStatus(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : value;
}

function createMockAnalyzeProduct(datasetName) {
  const geometry = createMockAoiGeometry(datasetName);

  return {
    DatasetName: datasetName,
    Status: 4,
    Edition: "1",
    Update: "0",
    ErrorMessage:
      "Mock IC-ENC rejection message. Replace this when the backend report payload is ready.",
    Data: {
      Aoi: JSON.stringify(geometry),
      Xml: createMockXml(datasetName),
    },
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
