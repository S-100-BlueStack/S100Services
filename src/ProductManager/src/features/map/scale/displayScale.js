export function resolveDisplayScaleValue(...sources) {
  for (const source of sources) {
    const value = normalizeDisplayScale(getRawDisplayScale(source));

    if (value !== null) {
      return value;
    }
  }

  return null;
}

export function getGraphicDisplayScale(graphic) {
  return resolveDisplayScaleValue(graphic?.attributes, graphic);
}

export function isGraphicVisibleAtScale(graphic, viewScale) {
  const displayScale = getGraphicDisplayScale(graphic);

  if (displayScale === null) {
    return true;
  }

  // ArcGIS scale values get smaller as the user zooms in.
  // The API's displayScale means the feature should disappear when zoomed in beyond that scale.
  return viewScale >= displayScale;
}

function getRawDisplayScale(source) {
  if (!source || typeof source !== "object") {
    return null;
  }

  return (
    source.displayScale ??
    source.DisplayScale ??
    source.display_scale ??
    source.displayscale ??
    null
  );
}

function normalizeDisplayScale(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const text = String(value)
    .trim()
    .replace(/^1\s*:\s*/i, "")
    .replace(/[.,_\s]/g, "");

  const number = Number(text);

  return Number.isFinite(number) && number > 0 ? number : null;
}
