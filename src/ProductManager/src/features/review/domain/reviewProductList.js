export function createReviewProductItems(datasetNames) {
  return normalizeReviewProductItems(toArray(datasetNames));
}

export function normalizeReviewProductItems(productItems) {
  const normalizedItems = [];
  const seenIds = new Set();

  for (const value of toArray(productItems)) {
    const datasetName = normalizeDatasetName(getProductItemDatasetName(value));

    if (!datasetName) {
      continue;
    }

    const id = createReviewProductItemId(datasetName);

    if (seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    normalizedItems.push({
      id,
      datasetName,
      enabled: getProductItemEnabled(value),
    });
  }

  return normalizedItems;
}

export function addReviewProductItem(productItems, datasetName) {
  const items = normalizeReviewProductItems(productItems);
  const normalizedDatasetName = normalizeDatasetName(datasetName);

  if (!normalizedDatasetName) {
    return items;
  }

  const id = createReviewProductItemId(normalizedDatasetName);
  let existingItemFound = false;

  const nextItems = items.map((item) => {
    if (item.id !== id) {
      return item;
    }

    existingItemFound = true;

    return {
      ...item,
      enabled: true,
    };
  });

  if (existingItemFound) {
    return nextItems;
  }

  return [
    ...nextItems,
    {
      id,
      datasetName: normalizedDatasetName,
      enabled: true,
    },
  ];
}

export function toggleReviewProductItem(productItems, itemId, enabled) {
  return normalizeReviewProductItems(productItems).map((item) => {
    if (item.id !== itemId) {
      return item;
    }

    return {
      ...item,
      enabled: Boolean(enabled),
    };
  });
}

export function removeReviewProductItem(productItems, itemId) {
  return normalizeReviewProductItems(productItems).filter((item) => item.id !== itemId);
}

export function getEnabledReviewDatasetNames(productItems) {
  return normalizeReviewProductItems(productItems)
    .filter((item) => item.enabled)
    .map((item) => item.datasetName);
}

function getProductItemDatasetName(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return value.datasetName ?? value.name ?? value.DatasetName ?? value.Name ?? "";
  }

  return value;
}

function getProductItemEnabled(value) {
  if (value !== null && typeof value === "object" && "enabled" in value) {
    return value.enabled !== false;
  }

  return true;
}

function createReviewProductItemId(datasetName) {
  return normalizeDatasetName(datasetName).toUpperCase();
}

function normalizeDatasetName(value) {
  return String(value ?? "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [value];
}
