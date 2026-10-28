import Extent from "@arcgis/core/geometry/Extent.js";

export async function zoomToGraphicsExtent(view, layers) {
  const extent = getLayersExtent(layers);

  if (!extent) {
    return false;
  }

  try {
    await view.goTo(extent.expand(1.25), {
      duration: 600,
    });

    return true;
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.warn("[Analyze] Failed to zoom to graphics extent", error);
    }

    return false;
  }
}

function getLayersExtent(layers) {
  return layers.reduce((combinedExtent, layer) => {
    const graphics = layer.graphics?.toArray?.() ?? [];

    for (const graphic of graphics) {
      const extent = getGeometryExtent(graphic.geometry);

      if (!extent) {
        continue;
      }

      combinedExtent = combinedExtent ? combinedExtent.union(extent) : extent.clone();
    }

    return combinedExtent;
  }, null);
}

function getGeometryExtent(geometry) {
  if (!geometry) {
    return null;
  }

  if (geometry.extent) {
    return geometry.extent.clone();
  }

  if (geometry.type === "point" && Number.isFinite(geometry.x) && Number.isFinite(geometry.y)) {
    const padding = 0.02;

    return new Extent({
      xmin: geometry.x - padding,
      ymin: geometry.y - padding,
      xmax: geometry.x + padding,
      ymax: geometry.y + padding,
      spatialReference: geometry.spatialReference ?? { wkid: 4326 },
    });
  }

  return null;
}
