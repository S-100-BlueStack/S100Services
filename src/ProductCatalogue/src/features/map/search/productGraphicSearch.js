export function findProductGraphic(layers, productName) {
  const productKey = createProductKey(productName);

  if (!productKey) {
    return null;
  }

  for (const layer of Array.isArray(layers) ? layers : []) {
    const graphics = getLayerGraphics(layer);
    const match = graphics.find((graphic) => {
      return createProductKey(readGraphicProductName(graphic)) === productKey;
    });

    if (match) {
      return match;
    }
  }

  return null;
}

export function readGraphicProductName(graphic) {
  const attributes = graphic?.attributes ?? {};

  return readAttribute(attributes, [
    "datasetName",
    "DatasetName",
    "datasetname",
    "productName",
    "ProductName",
    "name",
    "Name",
  ]);
}

export function createProductGraphicViewTarget(graphic) {
  const geometry = graphic?.geometry;

  if (!geometry) {
    return null;
  }

  if (geometry.extent) {
    return geometry.extent.expand?.(1.35) ?? geometry.extent;
  }

  return geometry;
}

export function createProductPopupLocation(graphic) {
  const geometry = graphic?.geometry;

  if (!geometry) {
    return null;
  }

  // Prefer extent.center so polygon search does not touch the deprecated
  // geometry.centroid property in newer ArcGIS SDK versions.
  return geometry.extent?.center ?? geometry;
}

function getLayerGraphics(layer) {
  const graphics = layer?.graphics;

  if (!graphics) {
    return [];
  }

  if (typeof graphics.toArray === "function") {
    return graphics.toArray();
  }

  if (Array.isArray(graphics)) {
    return graphics;
  }

  const result = [];

  if (typeof graphics.forEach === "function") {
    graphics.forEach((graphic) => result.push(graphic));
  }

  return result;
}

function readAttribute(attributes, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(attributes, name)) {
      return attributes[name];
    }
  }

  const normalizedNames = new Set(names.map(normalizeAttributeName));

  for (const [name, value] of Object.entries(attributes)) {
    if (normalizedNames.has(normalizeAttributeName(name))) {
      return value;
    }
  }

  return "";
}

function createProductKey(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function normalizeAttributeName(value) {
  return String(value ?? "")
    .trim()
    .replace(/[_\-\s]/g, "")
    .toLowerCase();
}
