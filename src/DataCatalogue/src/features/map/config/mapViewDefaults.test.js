import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultMapViewOptions, DEFAULT_ZOOM } from "./mapViewDefaults.js";

test("Shared MapView defaults allow a global Denmark and Greenland overview", () => {
  const options = createDefaultMapViewOptions();
  assert.deepEqual(options.center, [10.4, 56.15]);
  assert.equal(options.zoom, DEFAULT_ZOOM);
  assert.equal(options.zoom, 6, "The accepted initial view must not change");
  assert.deepEqual(options.constraints, { minZoom: 0, rotationEnabled: false });
  assert.equal("minScale" in options.constraints, false);
  assert.equal("geometry" in options.constraints, false);
});

test("Both MapViews receive independent defaults without shared mutable state", () => {
  const main = createDefaultMapViewOptions();
  const assignment = createDefaultMapViewOptions();
  main.constraints.minZoom = 4;
  main.center[0] = -45;
  assert.deepEqual(assignment.constraints, { minZoom: 0, rotationEnabled: false });
  assert.deepEqual(assignment.center, [10.4, 56.15]);
});
