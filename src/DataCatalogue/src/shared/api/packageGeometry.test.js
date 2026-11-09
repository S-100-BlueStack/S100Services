import test from "node:test";
import assert from "node:assert/strict";
import { normalizePackageGeometry } from "./packageGeometry.js";
import { createCatalogueService } from "./catalogueService.js";

const sr = { wkid: 4326 };
const rect = {
  rings: [
    [
      [10, 55],
      [11, 55],
      [11, 56],
      [10, 56],
      [10, 55],
    ],
  ],
  spatialReference: sr,
};

const envelope = (aoi = rect, detailedGeometry = null) => ({ aoi, detailedGeometry });

test("Package geometry read calls the verified v1 route with canonical identity and AbortSignal", async () => {
  const abort = new AbortController();
  const captured = [];
  const service = createCatalogueService({
    request: async (path, options) => {
      captured.push([path, options]);
      return envelope();
    },
  });
  assert.deepEqual(await service.packageGeometry("ID / A", { signal: abort.signal }), envelope());
  assert.equal(captured.length, 1);
  assert.equal(captured[0][0], "/api/v1/packages/ID%20%2F%20A/geometry");
  assert.equal(captured[0][1].signal, abort.signal);
});

test("A valid AOI and explicitly absent detailed geometry are displayable", () => {
  assert.deepEqual(normalizePackageGeometry(envelope()), envelope());
  assert.deepEqual(normalizePackageGeometry(envelope(null)), envelope(null));
  assert.deepEqual(
    normalizePackageGeometry(envelope(null, { points: [], curves: null, surfaces: null })),
    envelope(null, { points: [], curves: null, surfaces: null })
  );
});

test("Point, multipoint, polyline and surfaces preserve their distinct groups and spatial references", () => {
  const data = envelope(rect, {
    points: [
      { x: 10.5, y: 55.5, z: null, spatialReference: sr },
      {
        points: [
          [10, 55, null],
          [11, 56, 0],
        ],
        spatialReference: sr,
      },
    ],
    curves: {
      paths: [
        [
          [10, 55],
          [10.6, 55.5],
          [11, 56],
        ],
      ],
      spatialReference: sr,
    },
    surfaces: rect,
  });
  const normalized = normalizePackageGeometry(data);
  assert.deepEqual(normalized.detailedGeometry.points[0], {
    x: 10.5,
    y: 55.5,
    spatialReference: sr,
  });
  assert.deepEqual(normalized.detailedGeometry.points[1].points, [
    [10, 55],
    [11, 56],
  ]);
  assert.deepEqual(normalized.detailedGeometry.curves.paths, data.detailedGeometry.curves.paths);
  assert.deepEqual(normalized.detailedGeometry.surfaces, rect);
});

test("Curve geometry from Esri JSON is retained without guessing a straight-line replacement", () => {
  const data = envelope(null, {
    points: [],
    curves: {
      curvePaths: [
        [
          [10, 55],
          {
            c: [
              [11, 56],
              [10.3, 55.4],
            ],
          },
        ],
      ],
      spatialReference: sr,
    },
    surfaces: null,
  });
  assert.deepEqual(normalizePackageGeometry(data), data);
});

test("Missing or malformed API envelopes and invalid spatial references are errors, not empty geometry", () => {
  for (const value of [null, {}, { aoi: null }, { detailedGeometry: null }, "{}", []]) {
    assert.throws(() => normalizePackageGeometry(value), /envelope/);
  }
  for (const source of [{}, { wkid: 0 }, { wkid: -2 }, { wkt: " " }, { wkid: "4326" }]) {
    assert.throws(
      () => normalizePackageGeometry(envelope({ ...rect, spatialReference: source })),
      /spatial reference/
    );
  }
  assert.throws(
    () => normalizePackageGeometry(envelope({ ...rect, rings: [[[0, 0]]] })),
    /incomplete/
  );
  assert.throws(
    () =>
      normalizePackageGeometry(
        envelope({
          ...rect,
          rings: [
            [
              [10, 55],
              [11, 55],
              [12, 55],
              [10, 55],
            ],
          ],
        })
      ),
    /no finite area|ring/
  );
  assert.throws(
    () =>
      normalizePackageGeometry(
        envelope({
          ...rect,
          rings: [
            [
              [181, 0],
              [180, 1],
              [179, 1],
              [181, 0],
            ],
          ],
        })
      ),
    /WGS84/
  );
  assert.throws(
    () => normalizePackageGeometry(envelope(null, { points: {}, curves: null, surfaces: null })),
    /detailed/
  );
});

test("A successful HTTP response with malformed detail is not silently downgraded to AOI-only", async () => {
  const service = createCatalogueService({
    request: async () => envelope(rect, { points: null, curves: null, surfaces: null }),
  });
  await assert.rejects(service.packageGeometry("id"), /detailed/);
});
