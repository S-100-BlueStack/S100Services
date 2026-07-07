export function createAnalyzeDatasetItems(datasetNames) {
  return normalizeAnalyzeDatasetItems(toArray(datasetNames));
}

export function normalizeAnalyzeDatasetItems(datasetItems) {
  const normalizedItems = [];
  const seenIds = new Set();

  for (const value of toArray(datasetItems)) {
    const name = normalizeAnalyzeDatasetName(getDatasetItemName(value));

    if (!name) {
      continue;
    }

    const id = getAnalyzeDatasetItemId(name);

    if (seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    normalizedItems.push({
      id,
      name,
      enabled: getDatasetItemEnabled(value),
    });
  }

  return normalizedItems;
}

export function addAnalyzeDatasetItem(datasetItems, datasetName) {
  const items = normalizeAnalyzeDatasetItems(datasetItems);
  const name = normalizeAnalyzeDatasetName(datasetName);

  if (!name) {
    return items;
  }

  const id = getAnalyzeDatasetItemId(name);
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
      name,
      enabled: true,
    },
  ];
}

export function toggleAnalyzeDatasetItem(datasetItems, itemId, enabled) {
  return normalizeAnalyzeDatasetItems(datasetItems).map((item) => {
    if (item.id !== itemId) {
      return item;
    }

    return {
      ...item,
      enabled: Boolean(enabled),
    };
  });
}

export function removeAnalyzeDatasetItem(datasetItems, itemId) {
  return normalizeAnalyzeDatasetItems(datasetItems).filter((item) => item.id !== itemId);
}

export function getEnabledAnalyzeDatasetNames(datasetItems) {
  return normalizeAnalyzeDatasetItems(datasetItems)
    .filter((item) => item.enabled)
    .map((item) => item.name);
}

function normalizeAnalyzeDatasetName(value) {
  return String(value ?? '').trim();
}

function getAnalyzeDatasetItemId(datasetName) {
  return normalizeAnalyzeDatasetName(datasetName).toLowerCase();
}

function getDatasetItemName(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    return value.name ?? value.datasetName ?? '';
  }

  return value;
}

function getDatasetItemEnabled(value) {
  if (value !== null && typeof value === 'object' && 'enabled' in value) {
    return value.enabled !== false;
  }

  return true;
}

function toArray(value) {
  return Array.isArray(value) ? value : [value];
}
