export function normalizeProductCatalog(payload) {
  const values = getCatalogValues(payload);
  const products = [];
  const seen = new Set();

  for (const value of values) {
    const name = normalizeProductName(getProductName(value));
    if (!name) {
      continue;
    }

    const key = createProductKey(name);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    const metadata = getProductMetadata(value);
    products.push({
      id: key,
      name,
      ...metadata,
      searchText: createSearchText(
        [name, metadata.displayName, metadata.sourceLabel].filter(Boolean).join(" ")
      ),
    });
  }

  const sortedProducts = products.sort((left, right) => left.name.localeCompare(right.name));
  copyCatalogState(payload, sortedProducts);
  return sortedProducts;
}

export function filterProductCatalog(
  products,
  query,
  { limit = 20, excludedProductNames = [] } = {}
) {
  const excludedKeys = createProductKeySet(excludedProductNames);
  const normalizedProducts = normalizeProductCatalog(products).filter(
    (product) => !excludedKeys.has(product.id)
  );
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return normalizedProducts.slice(0, limit);
  }

  return normalizedProducts
    .map((product) => ({
      product,
      score: scoreProductMatch(product, normalizedQuery),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return left.product.name.localeCompare(right.product.name);
    })
    .slice(0, limit)
    .map((entry) => entry.product);
}

export function parseProductInput(value) {
  return String(value ?? "")
    .split(/[&\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function findProductCatalogMatch(products, productName) {
  const key = createProductKey(productName);
  if (!key) {
    return null;
  }

  return normalizeProductCatalog(products).find((product) => product.id === key) ?? null;
}

export function validateProductCatalogSelection(
  products,
  productNames,
  { excludedProductNames = [] } = {}
) {
  const normalizedProducts = normalizeProductCatalog(products);
  const catalogByKey = new Map(normalizedProducts.map((product) => [product.id, product]));
  const excludedKeys = createProductKeySet(excludedProductNames);
  const valid = [];
  const alreadySelected = [];
  const unknown = [];

  for (const productName of parseProductInput(productNames)) {
    const key = createProductKey(productName);
    if (!key) {
      continue;
    }

    if (excludedKeys.has(key)) {
      alreadySelected.push(productName);
      continue;
    }

    const match = catalogByKey.get(key);
    if (!match) {
      // A partial workspace catalog cannot authoritatively reject a name because
      // it may belong to the provider that failed. Resolution will still fail closed.
      if (normalizedProducts.incomplete) {
        valid.push(productName);
      } else {
        unknown.push(productName);
      }
      continue;
    }

    valid.push(match.name);
  }

  return {
    valid,
    alreadySelected,
    unknown,
  };
}

function getCatalogValues(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.Data)) {
    return payload.Data;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload?.Products)) {
    return payload.Products;
  }
  if (Array.isArray(payload?.products)) {
    return payload.products;
  }

  return [];
}

function getProductName(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return (
      value.name ??
      value.Name ??
      value.productName ??
      value.ProductName ??
      value.datasetName ??
      value.DatasetName ??
      ""
    );
  }

  return value;
}

function getProductMetadata(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries({
      datasetName: normalizeOptionalText(value.datasetName ?? value.DatasetName),
      displayName: normalizeOptionalText(value.displayName ?? value.DisplayName),
      sourceId: normalizeOptionalText(value.sourceId),
      sourceLabel: normalizeOptionalText(value.sourceLabel),
      productKey: normalizeOptionalText(value.productKey),
      productType: normalizeOptionalText(value.productType),
    }).filter(([, metadataValue]) => metadataValue !== undefined)
  );
}

function copyCatalogState(source, target) {
  const incomplete = Boolean(source?.incomplete);
  const providerErrors = Array.isArray(source?.providerErrors) ? source.providerErrors : [];
  const identityErrors = Array.isArray(source?.identityErrors) ? source.identityErrors : [];

  Object.defineProperties(target, {
    incomplete: {
      value: incomplete,
      enumerable: false,
    },
    providerErrors: {
      value: providerErrors.map((error) => ({ ...error })),
      enumerable: false,
    },
    identityErrors: {
      value: identityErrors.map((error) => ({
        ...error,
        providers: Array.isArray(error?.providers)
          ? error.providers.map((provider) => ({ ...provider }))
          : [],
      })),
      enumerable: false,
    },
  });
}

function normalizeProductName(value) {
  return String(value ?? "").trim();
}

function normalizeOptionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function createProductKey(value) {
  return normalizeProductName(value).toUpperCase();
}

function createProductKeySet(productNames) {
  return new Set(parseProductInput(productNames).map(createProductKey).filter(Boolean));
}

function createSearchText(name) {
  return normalizeSearchQuery(name);
}

function normalizeSearchQuery(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function scoreProductMatch(product, query) {
  if (!product.searchText.includes(query)) {
    return -1;
  }
  if (product.searchText === query) {
    return 0;
  }
  if (product.searchText.startsWith(query)) {
    return 1;
  }

  return 2;
}
