import { apiGet } from "../../../shared/api/apiClient.js";

const WORKSPACE_FRESHNESS_BATCH_SIZE = 50;

export async function fetchWorkspaceFreshness(datasetNames, { get = apiGet } = {}) {
  const names = normalizeDatasetNames(datasetNames);

  if (names.length === 0) {
    return [];
  }

  const items = [];
  for (let start = 0; start < names.length; start += WORKSPACE_FRESHNESS_BATCH_SIZE) {
    const batchNames = names.slice(start, start + WORKSPACE_FRESHNESS_BATCH_SIZE);
    const query = new URLSearchParams();
    for (const datasetName of batchNames) {
      query.append("datasetNames", datasetName);
    }

    const payload = await get(
      `electronicproducts/workspace/freshness?${query.toString()}`,
      "Workspace freshness could not be checked"
    );
    const values = payload?.Data ?? payload?.data ?? payload;

    if (!Array.isArray(values)) {
      throw new Error("Invalid workspace freshness response.");
    }

    const batchItems = values.map(normalizeWorkspaceFreshnessItem).filter(Boolean);
    validateWorkspaceFreshnessItems(batchItems, batchNames);
    items.push(...batchItems);
  }

  return items;
}

function validateWorkspaceFreshnessItems(items, requestedDatasetNames) {
  const requestedKeys = new Set(requestedDatasetNames.map(normalizeDatasetKey));
  const responseKeys = new Set();

  for (const item of items) {
    const key = normalizeDatasetKey(item.datasetName);
    if (!requestedKeys.has(key) || responseKeys.has(key)) {
      throw new Error("Invalid workspace freshness response.");
    }
    if (item.available && !String(item.revision ?? "").trim()) {
      throw new Error("Invalid workspace freshness response.");
    }
    responseKeys.add(key);
  }

  if (responseKeys.size !== requestedKeys.size) {
    throw new Error("Invalid workspace freshness response.");
  }
}

function normalizeWorkspaceFreshnessItem(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const datasetName = String(value.DatasetName ?? value.datasetName ?? "").trim();
  if (!datasetName) {
    return null;
  }

  const available = Boolean(value.Available ?? value.available);
  const rawRevision = value.Revision ?? value.revision;
  const revision = rawRevision === null || rawRevision === undefined ? null : String(rawRevision);

  return {
    datasetName,
    available,
    revision: available ? revision : null,
  };
}

function normalizeDatasetNames(datasetNames) {
  const values = Array.isArray(datasetNames) ? datasetNames : [datasetNames];
  const names = [];
  const seen = new Set();

  for (const value of values) {
    const datasetName = String(value ?? "").trim();
    const key = normalizeDatasetKey(datasetName);
    if (!datasetName || seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(datasetName);
  }

  return names;
}

function normalizeDatasetKey(datasetName) {
  return String(datasetName ?? "")
    .trim()
    .toUpperCase();
}
