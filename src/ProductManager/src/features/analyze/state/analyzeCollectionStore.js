const listeners = new Set();
let items = [];

export function addAnalyzeCollectionProduct(product) {
  const datasetName = getDatasetName(product);

  if (!datasetName) {
    return {
      added: false,
      reason: "missing-dataset-name",
      item: null,
      snapshot: getAnalyzeCollectionSnapshot(),
    };
  }

  const id = createDatasetId(datasetName);
  const existingItem = items.find((item) => item.id === id);

  if (existingItem) {
    return {
      added: false,
      reason: "already-added",
      item: existingItem,
      snapshot: getAnalyzeCollectionSnapshot(),
    };
  }

  const item = {
    id,
    datasetName,
    addedAt: Date.now(),
  };

  items = [...items, item];
  emitChange();

  return {
    added: true,
    reason: null,
    item,
    snapshot: getAnalyzeCollectionSnapshot(),
  };
}

export function removeAnalyzeCollectionProduct(datasetNameOrId) {
  const id = createDatasetId(datasetNameOrId);

  if (!id) {
    return getAnalyzeCollectionSnapshot();
  }

  const nextItems = items.filter((item) => item.id !== id);

  if (nextItems.length === items.length) {
    return getAnalyzeCollectionSnapshot();
  }

  items = nextItems;
  emitChange();

  return getAnalyzeCollectionSnapshot();
}

export function clearAnalyzeCollection() {
  if (items.length === 0) {
    return getAnalyzeCollectionSnapshot();
  }

  items = [];
  emitChange();

  return getAnalyzeCollectionSnapshot();
}

export function hasAnalyzeCollectionProduct(datasetNameOrId) {
  const id = createDatasetId(datasetNameOrId);

  if (!id) {
    return false;
  }

  return items.some((item) => item.id === id);
}

export function getAnalyzeCollectionDatasetNames() {
  return items.map((item) => item.datasetName);
}

export function getAnalyzeCollectionSnapshot() {
  return {
    items: items.map((item) => ({ ...item })),
    count: items.length,
    datasetNames: getAnalyzeCollectionDatasetNames(),
  };
}

export function subscribeAnalyzeCollection(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function emitChange() {
  const snapshot = getAnalyzeCollectionSnapshot();

  for (const listener of listeners) {
    listener(snapshot);
  }
}

function getDatasetName(product) {
  if (typeof product === "string") {
    return normalizeDatasetName(product);
  }

  return normalizeDatasetName(
    product?.datasetName ?? product?.DatasetName ?? product?.name ?? product?.Name
  );
}

function createDatasetId(value) {
  return normalizeDatasetName(value).toUpperCase();
}

function normalizeDatasetName(value) {
  return String(value ?? "").trim();
}
