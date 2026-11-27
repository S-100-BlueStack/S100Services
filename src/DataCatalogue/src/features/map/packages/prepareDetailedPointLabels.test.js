import test from "node:test";
import assert from "node:assert/strict";
import { normalizePackageGeometry } from "../../../shared/api/packageGeometry.js";
import { prepareDetailedPointLabels } from "./prepareDetailedPointLabels.js";

const sr = { wkid: 4326 };
const point = (x, y) => ({ x, y, spatialReference: sr });
const displayPoint = ({ x, y }) => ({ type: "point", x: x * 2, y: y * 2, extent: null });
const ensureCurrent = () => {};

function group(source) {
  return {
    source,
    // Simulate an SDK operation that changes multipart coordinate order. The
    // label positions and numbers must still come from the source members.
    geometry: source.points
      ? { type: "multipoint", points: [...source.points].reverse() }
      : displayPoint(source),
  };
}

function values(labels) {
  return labels.map(({ text, geometry: { x, y } }) => [text, x, y]);
}

test("Number the normalized point references and multipoint members in source order", async () => {
  const wire = {
    aoi: null,
    detailedGeometry: {
      points: [
        point(12, 56),
        {
          points: [
            [8, 55, null],
            [11, 54, 0],
          ],
          spatialReference: sr,
        },
        point(9, 57),
        { points: [[10, 54]], spatialReference: sr },
      ],
      curves: {
        paths: [
          [
            [1, 2],
            [3, 4],
          ],
        ],
        spatialReference: sr,
      },
      surfaces: {
        rings: [
          [
            [1, 1],
            [2, 1],
            [2, 2],
            [1, 1],
          ],
        ],
        spatialReference: sr,
      },
    },
  };
  const before = structuredClone(wire);
  const normalized = normalizePackageGeometry(wire);
  const projected = [];
  const labels = await prepareDetailedPointLabels(
    normalized.detailedGeometry.points.map(group),
    async (json) => {
      projected.push(json);
      return displayPoint(json);
    },
    ensureCurrent
  );
  assert.deepEqual(values(labels), [
    ["1", 24, 112],
    ["2", 16, 110],
    ["3", 22, 108],
    ["4", 18, 114],
    ["5", 20, 108],
  ]);
  assert.deepEqual(projected, [point(8, 55), point(11, 54), point(10, 54)]);
  assert.deepEqual(wire, before);
});

test("Coincident source points retain every ordinal without moving their anchors", async () => {
  const groups = [
    group(point(10, 55)),
    group({
      points: [
        [11, 56],
        [10, 55],
        [11, 56],
      ],
      spatialReference: sr,
    }),
    group(point(12, 54)),
  ];
  const labels = await prepareDetailedPointLabels(groups, displayPoint, ensureCurrent);
  assert.deepEqual(values(labels), [
    ["1, 3", 20, 110],
    ["2, 4", 22, 112],
    ["5", 24, 108],
  ]);
  assert.deepEqual(
    labels.map(({ id }) => id),
    ["1", "2", "5"]
  );
});

test("Each prepared Package restarts at one; empty details have no labels", async () => {
  const groups = [group(point(10, 55)), group(point(11, 56))];
  const first = await prepareDetailedPointLabels(groups, displayPoint, ensureCurrent);
  const second = await prepareDetailedPointLabels(groups, displayPoint, ensureCurrent);
  const empty = await prepareDetailedPointLabels([], displayPoint, ensureCurrent);
  assert.deepEqual(first, second);
  assert.deepEqual(empty, []);
  assert.equal(first[0].geometry, groups[0].geometry);
});

test("Superseded multipoint projection aborts before any label snapshot is returned", async () => {
  let resolve;
  let current = true;
  const projected = new Promise((done) => {
    resolve = done;
  });
  const pending = prepareDetailedPointLabels(
    [
      group({
        points: [
          [10, 55],
          [11, 56],
        ],
        spatialReference: sr,
      }),
    ],
    () => projected,
    () => {
      if (!current) throw new DOMException("Superseded", "AbortError");
    }
  );
  current = false;
  resolve(displayPoint(point(10, 55)));
  await assert.rejects(pending, { name: "AbortError" });
});

test("A failed member projection cannot return an incorrectly renumbered partial series", async () => {
  await assert.rejects(
    prepareDetailedPointLabels(
      [group(point(10, 55)), group({ points: [[11, 56]], spatialReference: sr })],
      async () => {
        throw new Error("Projection failed");
      },
      ensureCurrent
    ),
    /Projection failed/
  );
});
