import test from "node:test";
import assert from "node:assert/strict";
import {
  assertDisplayablePackageGeometry,
  packageGeometryFocusTarget,
} from "./packageGeometryDisplay.js";

function extent(xmin, ymin, xmax, ymax) {
  return {
    xmin,
    ymin,
    xmax,
    ymax,
    get width() {
      return this.xmax - this.xmin;
    },
    get height() {
      return this.ymax - this.ymin;
    },
    get center() {
      return { x: (this.xmin + this.xmax) / 2, y: (this.ymin + this.ymax) / 2 };
    },
    clone() {
      return extent(this.xmin, this.ymin, this.xmax, this.ymax);
    },
    union(other) {
      return extent(
        Math.min(this.xmin, other.xmin),
        Math.min(this.ymin, other.ymin),
        Math.max(this.xmax, other.xmax),
        Math.max(this.ymax, other.ymax)
      );
    },
    expand(factor) {
      const center = this.center;
      const halfWidth = (this.width * factor) / 2;
      const halfHeight = (this.height * factor) / 2;
      return extent(
        center.x - halfWidth,
        center.y - halfHeight,
        center.x + halfWidth,
        center.y + halfHeight
      );
    },
  };
}

const pointExtent = (point) => extent(point.x, point.y, point.x, point.y);
const asGraphic = (geometry) => ({ geometry });

test("Projected detailed Point is valid even though ArcGIS Point.extent is null", () => {
  const point = { type: "point", x: 10.4806833, y: 54.93615, extent: null };
  assert.doesNotThrow(() => assertDisplayablePackageGeometry(point));
});

test("Projected Point still requires finite x and y coordinates", () => {
  assert.throws(
    () => assertDisplayablePackageGeometry({ type: "point", x: NaN, y: 54, extent: null }),
    /invalid coordinates/
  );
  assert.throws(
    () => assertDisplayablePackageGeometry({ type: "point", x: 10, y: Infinity }),
    /invalid coordinates/
  );
});

test("Non-Point geometry still requires a usable finite extent", () => {
  assert.throws(
    () => assertDisplayablePackageGeometry({ type: "polyline", extent: null }),
    /empty or unsupported/
  );
  assert.throws(
    () => assertDisplayablePackageGeometry({ type: "polygon", extent: extent(10, 54, 10, 55) }),
    /empty extent/
  );
  assert.throws(
    () => assertDisplayablePackageGeometry({ type: "polygon", extent: extent(10, NaN, 11, 55) }),
    /empty or unsupported/
  );
  assert.doesNotThrow(() =>
    assertDisplayablePackageGeometry({
      type: "polygon",
      extent: extent(10.4806783, 54.936145, 10.4806883, 54.936155),
    })
  );
});

test("Selected Package AOI remains the preferred focus target with detailed points", () => {
  const aoi = { type: "polygon", extent: extent(10, 54, 11, 55) };
  const result = packageGeometryFocusTarget(
    {
      aoiGeometry: aoi,
      graphics: [asGraphic(aoi), asGraphic({ type: "point", x: 20, y: 60, extent: null })],
    },
    pointExtent
  );
  assert.deepEqual([result.xmin, result.ymin, result.xmax, result.ymax], [9.9, 53.9, 11.1, 55.1]);
});

test("A Package with one detailed point and no AOI focuses the point", () => {
  const point = { type: "point", x: 10.4806833, y: 54.93615, extent: null };
  const target = packageGeometryFocusTarget(
    { aoiGeometry: null, graphics: [asGraphic(point)] },
    pointExtent
  );
  assert.deepEqual(target, { target: point, zoom: 10 });
});

test("A point-only Package with multiple points focuses their combined extent", () => {
  const target = packageGeometryFocusTarget(
    {
      aoiGeometry: null,
      graphics: [
        asGraphic({ type: "point", x: 10, y: 54, extent: null }),
        asGraphic({ type: "point", x: 11, y: 55, extent: null }),
      ],
    },
    pointExtent
  );
  assert.ok(target.width > 1);
  assert.ok(target.height > 1);
  assert.ok(target.xmin < 10);
  assert.ok(target.ymax > 55);
});

test("A mixed Package without AOI includes point and line in focus extent", () => {
  const target = packageGeometryFocusTarget(
    {
      aoiGeometry: null,
      graphics: [
        asGraphic({ type: "polyline", extent: extent(10, 54, 11, 55) }),
        asGraphic({ type: "point", x: 12, y: 56, extent: null }),
      ],
    },
    pointExtent
  );
  assert.ok(target.xmax > 12);
  assert.ok(target.ymax > 56);
});

test("An empty graphics collection has no focus target", () => {
  assert.equal(packageGeometryFocusTarget({ aoiGeometry: null, graphics: [] }, pointExtent), null);
});
