import assert from "node:assert/strict";
import test from "node:test";

import { createInitialMockJobs, createRectanglePolygonGeometry } from "./mockJobData.js";

test("createInitialMockJobs creates enough active point Jobs to demonstrate clustering", () => {
  const jobs = createInitialMockJobs();
  const activePointJobs = jobs.filter(
    (job) => job.geometry?.type === "point" && job.status !== "done"
  );

  assert.ok(activePointJobs.length >= 16);
});

test("createInitialMockJobs keeps polygon Jobs compact for realistic map testing", () => {
  const jobs = createInitialMockJobs();
  const polygonJobs = jobs.filter((job) => job.geometry?.type === "polygon");

  assert.ok(polygonJobs.length >= 8);

  for (const job of polygonJobs) {
    const ring = job.geometry.rings[0];
    const longitudes = ring.map((coordinate) => coordinate[0]);
    const latitudes = ring.map((coordinate) => coordinate[1]);
    const width = Math.max(...longitudes) - Math.min(...longitudes);
    const height = Math.max(...latitudes) - Math.min(...latitudes);

    assert.ok(width <= 0.4);
    assert.ok(height <= 0.25);
  }
});

test("createRectanglePolygonGeometry creates a closed WGS84 polygon ring", () => {
  const geometry = createRectanglePolygonGeometry([10, 56], [0.2, 0.1]);

  assert.equal(geometry.type, "polygon");
  assert.deepEqual(geometry.spatialReference, {
    wkid: 4326,
  });
  assert.deepEqual(geometry.rings[0][0], geometry.rings[0].at(-1));
});
