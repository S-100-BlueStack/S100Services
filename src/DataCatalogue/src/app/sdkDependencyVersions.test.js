import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
);

test("ArcGIS core, map components, and Calcite use the same exact stable version", () => {
  const names = ["@arcgis/core", "@arcgis/map-components", "@esri/calcite-components"];
  const versions = names.map((name) => packageJson.dependencies[name]);

  for (const version of versions) {
    assert.match(version, /^\d+\.\d+\.\d+$/);
  }
  assert.equal(new Set(versions).size, 1, "Esri packages must remain release-aligned");
});
