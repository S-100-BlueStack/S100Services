import Graphic from "@arcgis/core/Graphic.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import Point from "@arcgis/core/geometry/Point.js";
import Multipoint from "@arcgis/core/geometry/Multipoint.js";
import Polyline from "@arcgis/core/geometry/Polyline.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import Extent from "@arcgis/core/geometry/Extent.js";
import {
  assertDisplayablePackageGeometry,
  packageGeometryFocusTarget,
} from "./packageGeometryDisplay.js";
import * as projectOperator from "@arcgis/core/geometry/operators/projectOperator.js";

let projectionReady;
function loadProjection() {
  if (projectOperator.isLoaded()) return Promise.resolve();
  projectionReady ??= projectOperator.load().catch((error) => {
    projectionReady = null;
    throw error;
  });
  return projectionReady;
}

const AOI_COLOR = [176, 60, 214];
const DETAIL_COLOR = [0, 135, 200];

export function createPackageGraphics({ map, view, id }) {
  const layer = new GraphicsLayer({
    id,
    title: "Selected Package AOI and detailed Features",
    popupEnabled: false,
  });
  map.add(layer);
  const ready = view.when().then(
    () => true,
    () => false
  );
  let alive = true;

  async function projected(json, Type) {
    let geometry = Type.fromJSON(json);
    if (!geometry?.spatialReference) {
      throw new Error("Package geometry has no usable spatial reference.");
    }
    if (!geometry.spatialReference.equals(view.spatialReference)) {
      try {
        await loadProjection();
        if (!alive) throw new Error("Package map was closed.");
        geometry = projectOperator.execute(geometry, view.spatialReference);
      } catch {
        throw new Error("Package geometry could not be projected to the map spatial reference.");
      }
    }
    assertDisplayablePackageGeometry(geometry);
    return geometry;
  }

  return {
    async prepare({ aoi, detailedGeometry }, { shouldApply = () => true } = {}) {
      if (!(await ready) || !alive) throw new Error("Package map is unavailable.");
      const ensureCurrent = () => {
        if (!alive || !shouldApply()) throw new DOMException("Superseded geometry", "AbortError");
      };
      ensureCurrent();
      const graphics = [];
      let aoiGeometry = null;
      let detailCount = 0;
      if (aoi) {
        aoiGeometry = await projected(aoi, Polygon);
        ensureCurrent();
        graphics.push(
          new Graphic({
            geometry: aoiGeometry,
            attributes: { kind: "package-aoi" },
            symbol: {
              type: "simple-fill",
              color: [...AOI_COLOR, 0.035],
              outline: { color: [...AOI_COLOR, 0.98], style: "dash", width: 2.8 },
            },
          })
        );
      }
      if (detailedGeometry) {
        if (detailedGeometry.surfaces) {
          const surface = await projected(detailedGeometry.surfaces, Polygon);
          ensureCurrent();
          graphics.push(
            new Graphic({
              geometry: surface,
              attributes: { kind: "package-surface" },
              symbol: {
                type: "simple-fill",
                color: [...DETAIL_COLOR, 0.15],
                outline: { color: [...DETAIL_COLOR, 0.95], width: 1.8 },
              },
            })
          );
          detailCount++;
        }
        if (detailedGeometry.curves) {
          const curve = await projected(detailedGeometry.curves, Polyline);
          ensureCurrent();
          graphics.push(
            new Graphic({
              geometry: curve,
              attributes: { kind: "package-curve" },
              symbol: { type: "simple-line", color: [...DETAIL_COLOR, 0.95], width: 2.4 },
            })
          );
          detailCount++;
        }
        for (const point of detailedGeometry.points) {
          if (!alive) throw new Error("Package map was closed.");
          const isMultipoint = Array.isArray(point.points);
          const geometry = await projected(point, isMultipoint ? Multipoint : Point);
          ensureCurrent();
          graphics.push(
            new Graphic({
              geometry,
              attributes: { kind: "package-point" },
              symbol: {
                type: "simple-marker",
                style: "circle",
                color: [255, 192, 58, 0.98],
                size: 8,
                outline: { color: [40, 50, 60, 0.95], width: 1.2 },
              },
            })
          );
          detailCount++;
        }
      }
      ensureCurrent();
      return { graphics, aoiGeometry, detailCount };
    },
    replace(prepared) {
      if (!alive) return;
      layer.removeAll();
      if (prepared.graphics.length) layer.addMany(prepared.graphics);
    },
    clear() {
      if (alive) layer.removeAll();
    },
    async focus(prepared, { shouldApply = () => true } = {}) {
      if (!(await ready) || !alive || !shouldApply() || !prepared.graphics.length) return false;
      const target = packageGeometryFocusTarget(
        prepared,
        (point) =>
          new Extent({
            xmin: point.x,
            ymin: point.y,
            xmax: point.x,
            ymax: point.y,
            spatialReference: point.spatialReference,
          })
      );
      if (!target || !shouldApply()) return false;
      await view.goTo(target, { animate: false });
      return true;
    },
    stop() {
      if (alive) view.animation?.stop();
    },
    destroy() {
      alive = false;
      map.remove(layer);
      layer.destroy();
    },
  };
}
