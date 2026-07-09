export const REVIEW_CONTENT_TYPES = Object.freeze({
  HISTORY: "history",
  IC_ENC_REPORTS: "ic-enc-reports",
  INTERNAL_VALIDATION_REPORTS: "internal-validation-reports",
});

const REVIEW_CONTENT_TYPE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: REVIEW_CONTENT_TYPES.HISTORY,
    label: "History",
    shortLabel: "History",
    description: "Product history events and status changes.",
    defaultEnabled: true,
  }),
  Object.freeze({
    id: REVIEW_CONTENT_TYPES.IC_ENC_REPORTS,
    label: "IC-ENC reports",
    shortLabel: "IC-ENC",
    description: "IC-ENC report content for this product.",
    defaultEnabled: false,
  }),
  Object.freeze({
    id: REVIEW_CONTENT_TYPES.INTERNAL_VALIDATION_REPORTS,
    label: "Internal validation reports",
    shortLabel: "Validation",
    description: "Internal validation reports for this product.",
    defaultEnabled: false,
  }),
]);

const REVIEW_CONTENT_TYPE_IDS = new Set(
  REVIEW_CONTENT_TYPE_DEFINITIONS.map((definition) => definition.id)
);

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
      contentTypes: normalizeReviewContentTypes(getProductItemContentTypes(value)),
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
      contentTypes: createDefaultReviewContentTypes(),
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

export function toggleReviewProductContentType(productItems, itemId, contentTypeId, enabled) {
  const normalizedContentTypeId = normalizeReviewContentTypeId(contentTypeId);

  if (!normalizedContentTypeId) {
    return normalizeReviewProductItems(productItems);
  }

  return normalizeReviewProductItems(productItems).map((item) => {
    if (item.id !== itemId) {
      return item;
    }

    return {
      ...item,
      contentTypes: {
        ...item.contentTypes,
        [normalizedContentTypeId]: Boolean(enabled),
      },
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

export function getReviewContentTypeDefinitions() {
  return REVIEW_CONTENT_TYPE_DEFINITIONS.map((definition) => ({ ...definition }));
}

export function getEnabledReviewContentTypes(productItem) {
  const normalizedContentTypes = normalizeReviewContentTypes(productItem?.contentTypes);

  return REVIEW_CONTENT_TYPE_DEFINITIONS.filter(
    (definition) => normalizedContentTypes[definition.id]
  ).map((definition) => definition.id);
}

export function isReviewContentTypeEnabled(productItem, contentTypeId) {
  const normalizedContentTypeId = normalizeReviewContentTypeId(contentTypeId);

  if (!normalizedContentTypeId) {
    return false;
  }

  return Boolean(normalizeReviewContentTypes(productItem?.contentTypes)[normalizedContentTypeId]);
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

function getProductItemContentTypes(value) {
  if (value !== null && typeof value === "object") {
    return value.contentTypes ?? value.reviewContentTypes ?? null;
  }

  return null;
}

function normalizeReviewContentTypes(contentTypes) {
  const normalizedContentTypes = createDefaultReviewContentTypes();

  if (!contentTypes || typeof contentTypes !== "object") {
    return normalizedContentTypes;
  }

  for (const definition of REVIEW_CONTENT_TYPE_DEFINITIONS) {
    if (Object.hasOwn(contentTypes, definition.id)) {
      normalizedContentTypes[definition.id] = contentTypes[definition.id] !== false;
    }
  }

  return normalizedContentTypes;
}

function normalizeReviewContentTypeId(contentTypeId) {
  const normalizedContentTypeId = String(contentTypeId ?? "").trim();

  return REVIEW_CONTENT_TYPE_IDS.has(normalizedContentTypeId) ? normalizedContentTypeId : "";
}

function createDefaultReviewContentTypes() {
  return REVIEW_CONTENT_TYPE_DEFINITIONS.reduce((selection, definition) => {
    selection[definition.id] = definition.defaultEnabled;
    return selection;
  }, {});
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
