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
    products.push({
      id: key,
      name,
      searchText: createSearchText(name),
    });
  }

  return products.sort((left, right) => left.name.localeCompare(right.name));
}

export function filterProductCatalog(products, query, { limit = 20 } = {}) {
  const normalizedProducts = normalizeProductCatalog(products);
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

function normalizeProductName(value) {
  return String(value ?? "").trim();
}

function createProductKey(value) {
  return normalizeProductName(value).toUpperCase();
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
