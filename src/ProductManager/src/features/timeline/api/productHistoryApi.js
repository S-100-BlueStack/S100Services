import {
  PRODUCT_HISTORY_EVENT_TYPE,
  PRODUCT_HISTORY_SOURCE,
  normalizeProductHistoryResponse,
} from "../model/productHistoryTypes.js";

const USE_DEMO_PRODUCT_HISTORY = true;

export async function fetchProductHistory(datasetName) {
  const normalizedDatasetName = normalizeDatasetName(datasetName);

  if (!normalizedDatasetName) {
    throw new Error("datasetName is required to fetch product history.");
  }

  if (USE_DEMO_PRODUCT_HISTORY) {
    return normalizeProductHistoryResponse(createDemoProductHistory(normalizedDatasetName));
  }

  return normalizeProductHistoryResponse({
    endpointAvailable: false,
    datasetName: normalizedDatasetName,
    source: PRODUCT_HISTORY_SOURCE.BACKEND,
    events: [],
  });
}

function createDemoProductHistory(datasetName) {
  return {
    endpointAvailable: false,
    datasetName,
    source: PRODUCT_HISTORY_SOURCE.DEMO,
    generatedAt: new Date().toISOString(),
    warnings: ["Showing demo history until the backend product history endpoint is available."],
    events: [
      {
        id: `${datasetName}:sent-to-ic-enc`,
        type: PRODUCT_HISTORY_EVENT_TYPE.SEND,
        timestamp: "2026-06-03T13:20:00Z",
        title: "Sent to IC-ENC",
        description: "The product was sent manually from Product Manager after review.",
        actor: "Product Manager",
        source: "Demo data",
        details: {
          destination: "IC-ENC",
          trigger: "Manual send",
        },
      },
      {
        id: `${datasetName}:export-update`,
        type: PRODUCT_HISTORY_EVENT_TYPE.EXPORT,
        timestamp: "2026-06-03T12:45:00Z",
        title: "Update export requested",
        description: "An update export was requested for all configured product formats.",
        actor: "Product Manager",
        source: "Demo data",
        details: {
          scope: "All",
          exportType: "Update",
        },
      },
      {
        id: `${datasetName}:unfrozen`,
        type: PRODUCT_HISTORY_EVENT_TYPE.UNFREEZE,
        timestamp: "2026-06-03T12:30:00Z",
        title: "Product unfrozen",
        description: "The product was unfrozen so it could continue through the send/export flow.",
        actor: "Product Manager",
        source: "Demo data",
        details: {
          previousState: "Frozen",
          nextState: "Active",
        },
      },
      {
        id: `${datasetName}:frozen`,
        type: PRODUCT_HISTORY_EVENT_TYPE.FREEZE,
        timestamp: "2026-06-02T15:10:00Z",
        title: "Product frozen",
        description: "The product was frozen while corrections were being reviewed.",
        actor: "Product Manager",
        source: "Demo data",
        details: {
          previousState: "Active",
          nextState: "Frozen",
        },
      },
      {
        id: `${datasetName}:analysis`,
        type: PRODUCT_HISTORY_EVENT_TYPE.ANALYSIS,
        timestamp: "2026-06-02T14:35:00Z",
        title: "Analysis opened",
        description: "The product was opened in Analyze to inspect report and XML content.",
        actor: "Product Manager",
        source: "Demo data",
      },
      {
        id: `${datasetName}:loaded`,
        type: PRODUCT_HISTORY_EVENT_TYPE.STATUS,
        timestamp: "2026-06-02T14:20:00Z",
        title: "Product loaded",
        description: "The product correction was loaded into the Product Manager map.",
        actor: "Product Manager",
        source: "Demo data",
      },
    ],
  };
}

function normalizeDatasetName(datasetName) {
  const normalizedDatasetName = String(datasetName ?? "").trim();
  return normalizedDatasetName || null;
}
