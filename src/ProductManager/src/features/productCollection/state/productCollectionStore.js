const listeners = new Set();
let items = [];

export function addProductCollectionProduct(product) {
  const datasetName = getDatasetName(product);

  if (!datasetName) {
    return {
      added: false,
      reason: "missing-dataset-name",
      item: null,
      snapshot: getProductCollectionSnapshot(),
    };
  }

  const id = createDatasetId(datasetName);
  const existingItem = items.find((item) => item.id === id);

  if (existingItem) {
    return {
      added: false,
      reason: "already-added",
      item: existingItem,
      snapshot: getProductCollectionSnapshot(),
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
    snapshot: getProductCollectionSnapshot(),
  };
}

export function removeProductCollectionProduct(datasetNameOrId) {
  const id = createDatasetId(datasetNameOrId);

  if (!id) {
    return getProductCollectionSnapshot();
  }

  const nextItems = items.filter((item) => item.id !== id);

  if (nextItems.length === items.length) {
    return getProductCollectionSnapshot();
  }

  items = nextItems;
  emitChange();

  return getProductCollectionSnapshot();
}

export function clearProductCollection() {
  if (items.length === 0) {
    return getProductCollectionSnapshot();
  }

  items = [];
  emitChange();

  return getProductCollectionSnapshot();
}

export function hasProductCollectionProduct(datasetNameOrId) {
  const id = createDatasetId(datasetNameOrId);

  if (!id) {
    return false;
  }

  return items.some((item) => item.id === id);
}

export function getProductCollectionDatasetNames() {
  return items.map((item) => item.datasetName);
}

export function getProductCollectionSnapshot() {
  return {
    items: items.map((item) => ({ ...item })),
    count: items.length,
    datasetNames: getProductCollectionDatasetNames(),
  };
}

export function subscribeProductCollection(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function emitChange() {
  const snapshot = getProductCollectionSnapshot();

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
