import { serializeProductIdentity } from "../../dataSources/domain/productIdentity.js";
import { COMPATIBILITY_PRODUCT_SOURCE_ID } from "../../products/domain/productContext.js";

const listeners = new Set();
let items = [];

export function addProductCollectionProduct(product) {
  const normalizedProduct = normalizeCollectionProduct(product);
  if (!normalizedProduct) {
    return {
      added: false,
      reason: "missing-product-identity",
      item: null,
      snapshot: getProductCollectionSnapshot(),
    };
  }

  const existingItem = items.find((item) => isSameCollectionIdentity(item, normalizedProduct));
  if (existingItem) {
    return {
      added: false,
      reason: "already-added",
      item: existingItem,
      snapshot: getProductCollectionSnapshot(),
    };
  }

  const item = {
    ...normalizedProduct,
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

export function removeProductCollectionProduct(productOrIdentity) {
  const itemId = resolveExistingItemId(productOrIdentity);
  if (!itemId) {
    return getProductCollectionSnapshot();
  }

  const nextItems = items.filter((item) => item.id !== itemId);
  if (nextItems.length === items.length) {
    return getProductCollectionSnapshot();
  }

  items = nextItems;
  emitChange();
  return getProductCollectionSnapshot();
}

export function removeProductCollectionProductsBySource(sourceId) {
  const normalizedSourceId = normalizeText(sourceId);
  if (!normalizedSourceId) {
    return getProductCollectionSnapshot();
  }

  const nextItems = items.filter((item) => item.sourceId !== normalizedSourceId);
  if (nextItems.length === items.length) {
    return getProductCollectionSnapshot();
  }

  items = nextItems;
  emitChange();
  return getProductCollectionSnapshot();
}

export function reconcileProductCollectionSourceProducts(sourceId, products) {
  const normalizedSourceId = normalizeText(sourceId);
  if (!normalizedSourceId) {
    return getProductCollectionSnapshot();
  }

  const currentIdentityKeys = new Set(
    (Array.isArray(products) ? products : [])
      .map((product) => createSourceProductIdentityKey(normalizedSourceId, product))
      .filter(Boolean)
  );
  const nextItems = items.filter((item) => {
    return item.sourceId !== normalizedSourceId || currentIdentityKeys.has(item.id);
  });

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

export function hasProductCollectionProduct(productOrIdentity) {
  return Boolean(resolveExistingItemId(productOrIdentity));
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

function normalizeCollectionProduct(product) {
  if (typeof product === "string") {
    return createLegacyCompatibilityProduct(product);
  }

  const sourceId = normalizeText(product?.sourceId);
  const productKey = normalizeText(product?.productKey);
  const datasetName = normalizeDatasetName(product?.datasetName);
  const productType = normalizeText(product?.productType);
  if (!sourceId || !productKey || !datasetName || !productType) {
    return null;
  }

  return {
    id: serializeProductIdentity({ sourceId, productKey }),
    sourceId,
    sourceLabel: normalizeText(product?.sourceLabel) ?? sourceId,
    productKey,
    datasetName,
    productType,
  };
}

function createLegacyCompatibilityProduct(datasetName) {
  const normalizedDatasetName = normalizeDatasetName(datasetName);
  if (!normalizedDatasetName) {
    return null;
  }

  return {
    id: serializeProductIdentity({
      sourceId: COMPATIBILITY_PRODUCT_SOURCE_ID,
      productKey: normalizedDatasetName,
    }),
    sourceId: COMPATIBILITY_PRODUCT_SOURCE_ID,
    sourceLabel: "Compatibility AOI",
    productKey: normalizedDatasetName,
    datasetName: normalizedDatasetName,
    productType: "compatibility-product",
  };
}

function resolveExistingItemId(productOrIdentity) {
  if (productOrIdentity && typeof productOrIdentity === "object") {
    const normalizedProduct = normalizeCollectionProduct(productOrIdentity);
    return normalizedProduct
      ? (items.find((item) => isSameCollectionIdentity(item, normalizedProduct))?.id ?? null)
      : null;
  }

  const value = normalizeText(productOrIdentity);
  if (!value) {
    return null;
  }

  const exactIdentity = items.find((item) => item.id === value);
  if (exactIdentity) {
    return exactIdentity.id;
  }

  const datasetKey = value.toUpperCase();
  return items.find((item) => item.datasetName.toUpperCase() === datasetKey)?.id ?? null;
}

function isSameCollectionIdentity(left, right) {
  if (!left || !right || left.sourceId !== right.sourceId) {
    return false;
  }

  if (left.id === right.id) {
    return true;
  }

  // Compatibility AOI callers historically matched dataset names case-insensitively.
  // Keep that transition behavior while registered source identities remain owned by
  // the canonical [sourceId, productKey] serializer.
  return (
    left.sourceId === COMPATIBILITY_PRODUCT_SOURCE_ID &&
    left.datasetName.toUpperCase() === right.datasetName.toUpperCase()
  );
}

function createSourceProductIdentityKey(sourceId, product) {
  const productSourceId = normalizeText(product?.sourceId) ?? sourceId;
  const productKey = normalizeText(product?.productKey ?? product?.attributes?.productKey);
  if (productSourceId !== sourceId || !productKey) {
    return null;
  }

  try {
    return serializeProductIdentity({ sourceId, productKey });
  } catch {
    return null;
  }
}

function normalizeDatasetName(value) {
  return normalizeText(value);
}

function normalizeText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
