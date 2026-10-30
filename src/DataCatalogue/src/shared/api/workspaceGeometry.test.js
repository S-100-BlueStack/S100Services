import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWorkspacePolygon, workspaceGeometryKey } from "./workspaceGeometry.js";

const shape = () => ({
  rings: [
    [
      [12, 55],
      [12, 56],
      [13, 56],
      [13, 55],
      [12, 55],
    ],
  ],
  spatialReference: { wkid: 4326 },
});
const parse = (value) => normalizeWorkspacePolygon(JSON.stringify(value));

test("Esri polygon normalization preserves rings, holes and explicit horizontal reference", () => {
  const value = shape();
  value.rings.push([
    [12.2, 55.2],
    [12.8, 55.2],
    [12.8, 55.8],
    [12.2, 55.8],
    [12.2, 55.2],
  ]);
  assert.deepEqual(parse(value), value);
  assert.deepEqual(
    parse({ ...shape(), spatialReference: { wkid: 102100, latestWkid: 3857 } }).spatialReference,
    { wkid: 3857 }
  );
  assert.deepEqual(
    parse({ ...shape(), spatialReference: { wkt: 'PROJCS["fixture"]' } }).spatialReference,
    { wkt: 'PROJCS["fixture"]' }
  );
});

test("Z and M coordinates are validated but the map uses the actual XY footprint", () => {
  const value = shape();
  value.rings = value.rings.map((ring) => ring.map((point) => [...point, 0, 42]));
  value.hasZ = true;
  value.hasM = true;
  assert.deepEqual(parse(value), shape());
});

for (const [name, value] of [
  ["missing", null],
  ["empty string", ""],
  ["malformed JSON", "{"],
  ["object instead of string", shape()],
  ["oversized string", " ".repeat(2_000_001)],
])
  test(`Unavailable or invalid geometry fails explicitly: ${name}`, () =>
    assert.throws(() => normalizeWorkspacePolygon(value)));

for (const [name, change] of [
  ["nonpolygon", () => ({ x: 1, y: 2, spatialReference: { wkid: 4326 } })],
  ["empty rings", (v) => ({ ...v, rings: [] })],
  ["missing spatial reference", (v) => ({ ...v, spatialReference: null })],
  ["unknown spatial reference", (v) => ({ ...v, spatialReference: {} })],
  ["invalid WKID", (v) => ({ ...v, spatialReference: { wkid: -1 } })],
  ["noninteger WKID", (v) => ({ ...v, spatialReference: { wkid: 12.5 } })],
  ["invalid WKT", (v) => ({ ...v, spatialReference: { wkt: {} } })],
  ["curve rings", (v) => ({ ...v, curveRings: v.rings })],
  [
    "unclosed ring",
    (v) => ({
      ...v,
      rings: [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 0],
        ],
      ],
    }),
  ],
  [
    "degenerate ring",
    (v) => ({
      ...v,
      rings: [
        [
          [0, 0],
          [1, 1],
          [2, 2],
          [0, 0],
        ],
      ],
    }),
  ],
  [
    "null coordinate",
    (v) => ({
      ...v,
      rings: [
        [
          [0, 0],
          [null, 1],
          [1, 1],
          [0, 0],
        ],
      ],
    }),
  ],
  [
    "string coordinate",
    (v) => ({
      ...v,
      rings: [
        [
          [0, 0],
          ["1", 1],
          [1, 1],
          [0, 0],
        ],
      ],
    }),
  ],
  [
    "out-of-range degrees",
    (v) => ({
      ...v,
      rings: [
        [
          [190, 0],
          [190, 1],
          [191, 1],
          [190, 0],
        ],
      ],
    }),
  ],
])
  test(`Unsupported polygon data is never repaired or substituted: ${name}`, () =>
    assert.throws(() => parse(change(shape()))));

test("Workspace identity includes Pipeline and rejects missing identifiers", () => {
  assert.notEqual(
    workspaceGeometryKey({ pipelineId: "a", workspaceId: "w" }),
    workspaceGeometryKey({ pipelineId: "b", workspaceId: "w" })
  );
  assert.throws(() => workspaceGeometryKey({ workspaceId: "w" }));
});

test("Nullable optional Esri Z/M values do not invalidate a finite XY footprint", () => {
  const value = shape();
  value.rings = value.rings.map((ring) => ring.map((point) => [...point, null]));
  assert.deepEqual(parse(value), shape());
});
