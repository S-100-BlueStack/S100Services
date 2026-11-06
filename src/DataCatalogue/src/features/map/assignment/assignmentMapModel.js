export function mapServiceUrl(value) {
  if (!value?.trim()) {
    throw new Error("Set VITE_WORK_STREAM_MAP_SERVICE_URL to enable live Work stream geography.");
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Work stream map service URL is invalid.");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/\/MapServer\/?$/i.test(url.pathname)
  ) {
    throw new Error(
      "Work stream geography requires an HTTPS MapServer base URL without credentials, query parameters or fragments."
    );
  }

  return url.href.replace(/\/$/, "");
}

export function layerBindings(workStreams) {
  const layers = new Map();

  for (const workStream of workStreams) {
    for (const id of workStream.layerIds ?? []) {
      if (!Number.isInteger(id) || id < 0) {
        throw new Error("Work stream map layer ID is invalid.");
      }

      if (!layers.has(id)) layers.set(id, { layerId: id, workStreamIds: [] });
      const binding = layers.get(id);
      if (!binding.workStreamIds.includes(workStream.id)) {
        binding.workStreamIds.push(workStream.id);
      }
    }
  }

  return [...layers.values()];
}

export function workStreamRenderer(geometryType, assigned) {
  const color = assigned ? [32, 158, 109, 0.22] : [103, 125, 150, 0.08];
  const outline = {
    color: assigned ? [20, 155, 102, 1] : [108, 124, 143, 0.82],
    width: assigned ? 2.25 : 1,
    style: assigned ? "solid" : "dash",
  };

  let symbol;
  if (geometryType === "polygon") {
    symbol = { type: "simple-fill", color, outline };
  } else if (geometryType === "polyline") {
    symbol = { type: "simple-line", ...outline };
  } else if (["point", "multipoint"].includes(geometryType)) {
    symbol = {
      type: "simple-marker",
      size: assigned ? 8 : 6,
      color: outline.color,
      style: assigned ? "diamond" : "circle",
      outline: { color: "white", width: 1 },
    };
  } else {
    throw new Error("Work stream layer has unsupported geometry.");
  }

  return { type: "simple", symbol };
}

export function featureGraphicProperties(feature) {
  const geometry = feature.geometry;
  if (
    geometry?.type !== "point" ||
    geometry.spatialReference?.wkid !== 4326 ||
    !Number.isFinite(geometry.longitude) ||
    !Number.isFinite(geometry.latitude)
  ) {
    throw new Error("Feature geometry is not supported by the prototype map adapter.");
  }

  return {
    geometry,
    symbol: {
      type: "simple-marker",
      style: "cross",
      size: 16,
      color: [0, 122, 194, 1],
      outline: { color: [255, 255, 255, 0.95], width: 1.5 },
    },
  };
}
