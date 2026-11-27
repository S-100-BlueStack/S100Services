import assert from "node:assert/strict";
import test from "node:test";
import { createPackageRequest } from "../../packageCreator/createPackageRequest.js";
import { createAoiGeometry } from "./aoiGeometry.js";

const wgs84 = {
  wkid: 4326,
  equals(other) {
    return this.wkid === other.wkid;
  },
};
const mercator = { wkid: 3857, isWebMercator: true, equals: wgs84.equals };
const rectangle = (west, south, east, north) => [
  [west, south],
  [west, north],
  [east, north],
  [east, south],
  [west, south],
];

function polygon(rings, spatialReference = wgs84) {
  const x = rings.flat().map((point) => point[0]);
  const y = rings.flat().map((point) => point[1]);
  return {
    type: "polygon",
    rings,
    spatialReference,
    extent: {
      xmin: Math.min(...x),
      xmax: Math.max(...x),
      ymin: Math.min(...y),
      ymax: Math.max(...y),
    },
  };
}

function geometry(operators = {}) {
  return createAoiGeometry({
    linearize: (value) => value,
    project: () => assert.fail("Unexpected projection"),
    union: () => assert.fail("Unexpected union"),
    isSimple: () => true,
    ...operators,
  });
}

test("one source-plane union preserves disjoint rings, holes and precision in the request", () => {
  const first = rectangle(10.123456789012, 55, 11, 56);
  const second = rectangle(13, 55, 14, 56);
  const hole = rectangle(13.25, 55.25, 13.75, 55.75).reverse();
  const sources = [polygon([first]), polygon([second, hole])];
  const aoiGeometry = geometry({
    union(values) {
      assert.deepEqual(values, sources);
      return polygon([first, second, hole]);
    },
  });
  const aoi = aoiGeometry.combine(sources.map(aoiGeometry.prepare));
  const fields = { category: "WorkZone", absoluteUri: "urn:example:aoi" };
  assert.deepEqual(createPackageRequest(fields, [{ id: fields.category }], aoi), {
    ...fields,
    esriJSON: JSON.stringify({ rings: [first, second, hole], spatialReference: { wkid: 4326 } }),
  });
});

test("linearization precedes union or projection and WGS 84 topology is checked again", () => {
  const input = polygon([rectangle(100, 200, 300, 400)], mercator);
  const linear = polygon([rectangle(100, 200, 300, 400)], mercator);
  const projected = polygon([rectangle(12, 55, 13, 56)]);
  const calls = [];
  const aoiGeometry = geometry({
    linearize(value) {
      assert.equal(value, input);
      calls.push("linearize");
      return linear;
    },
    project(value) {
      assert.equal(value, linear);
      calls.push("project");
      return projected;
    },
    isSimple(value) {
      calls.push(value.spatialReference.wkid);
      return true;
    },
  });
  assert.deepEqual(aoiGeometry.combine([aoiGeometry.prepare(input)]).rings, projected.rings);
  assert.deepEqual(calls, ["linearize", 3857, "project", 4326]);
});

test("rejects non-XY, world copies, date-line crossing and invalid union/projection results", () => {
  const aoiGeometry = geometry();
  const valid = polygon([rectangle(12, 55, 13, 56)]);
  assert.throws(() => aoiGeometry.prepare({ ...valid, hasZ: true }), /two-dimensional/);
  assert.throws(
    () => aoiGeometry.prepare(polygon([rectangle(21000000, 100, 22000000, 200)], mercator)),
    /date line/
  );
  const wrapped = polygon([rectangle(-179, 50, 179, 51)]);
  assert.throws(() => aoiGeometry.combine([wrapped]), /date line/);
  assert.throws(() => geometry({ union: () => null }).combine([valid, valid]), /nonempty/);
  assert.throws(
    () => geometry({ isSimple: () => false }).combine([valid]),
    /invalid polygon topology/
  );
  assert.equal(aoiGeometry.combine([]), null);
});

test("installed ArcGIS operators dissolve overlaps and keep gaps between disjoint areas", async (t) => {
  let Polygon;
  try {
    ({ default: Polygon } = await import("@arcgis/core/geometry/Polygon.js"));
  } catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND" || !error.message.includes("'@arcgis/core'")) {
      throw error;
    }
    t.skip("The pinned ArcGIS Core dependency is not installed.");
    return;
  }

  const { loadAoiGeometry } = await import("./loadAoiGeometry.js");
  const { execute: intersects } =
    await import("@arcgis/core/geometry/operators/intersectsOperator.js");
  const { default: Point } = await import("@arcgis/core/geometry/Point.js");
  const reference = { wkid: 4326 };
  const make = (...bounds) =>
    new Polygon({ rings: [rectangle(...bounds)], spatialReference: reference });
  const ops = await loadAoiGeometry({ isWebMercator: false });
  const aggregate = (...areas) => Polygon.fromJSON(ops.combine(areas.map(ops.prepare)));
  const first = make(10, 55, 11, 56);
  const separate = aggregate(first, make(13, 55, 14, 56));
  const merged = aggregate(first, make(10.5, 55.25, 12, 56.25));

  assert.equal(separate.rings.length, 2);
  assert.equal(merged.rings.length, 1);
  const point = (x, y) => new Point({ x, y, spatialReference: reference });
  assert.equal(intersects(separate, point(10.5, 55.5)), true);
  assert.equal(intersects(separate, point(13.5, 55.5)), true);
  assert.equal(intersects(separate, point(12, 55.5)), false);
  assert.equal(intersects(merged, point(10.75, 55.5)), true);
  assert.equal(intersects(merged, point(11.75, 55.05)), false);

  const circle = Polygon.fromJSON({
    curveRings: [
      [
        [12, 55],
        {
          c: [
            [12, 56],
            [11.5, 55.5],
          ],
        },
        {
          c: [
            [12, 55],
            [12.5, 55.5],
          ],
        },
      ],
    ],
    spatialReference: reference,
  });
  const circleAoi = aggregate(circle);
  assert.ok(circleAoi.rings[0].length > 10);
  assert.equal(intersects(circleAoi, point(12, 55.5)), true);
  assert.equal(intersects(circleAoi, point(12.45, 55.95)), false);
});
