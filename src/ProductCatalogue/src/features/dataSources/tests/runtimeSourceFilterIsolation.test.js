import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../../..", import.meta.url);

async function readProjectFile(relativePath) {
  return readFile(new URL(relativePath, projectRoot), "utf8");
}

test("runtime source changes do not republish compatibility filter state", async () => {
  const initMapSource = await readProjectFile("src/app/initMap.js");
  const callbackMatch = initMapSource.match(
    /onLayersChanged:\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\},\n\s*\}\);/
  );

  assert.ok(callbackMatch, "Expected the runtime source onLayersChanged callback.");
  assert.match(initMapSource, /const bindScaleVisibility = \(layers = getAllLayers\(\)\) =>/);
  assert.match(
    initMapSource,
    /const bindMapVisibility = \(layers = getAllLayers\(\)\) => \{[\s\S]*compatibilityDerivedState\.replace\(layers\);[\s\S]*bindScaleVisibility\(layers\);/
  );
  assert.match(callbackMatch[1], /bindScaleVisibility\(\);/);
  assert.doesNotMatch(callbackMatch[1], /bindMapVisibility\(\);/);
  assert.doesNotMatch(callbackMatch[1], /compatibilityDerivedState\.replace/);
});
