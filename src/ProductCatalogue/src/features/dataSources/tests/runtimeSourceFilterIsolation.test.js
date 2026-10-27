import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../../..", import.meta.url);

async function readProjectFile(relativePath) {
  return readFile(new URL(relativePath, projectRoot), "utf8");
}

test("runtime source changes do not republish compatibility filter state", async () => {
  const initMapSource = await readProjectFile("src/app/initMap.js");
  // Retain the exact callback boundaries and forbidden writes for both line endings.
  for (const variant of [
    initMapSource.replace(/\r\n?/g, "\n"),
    initMapSource.replace(/\r?\n/g, "\r\n"),
  ]) {
    const callbackMatch = variant.match(
      /onLayersChanged:\s*\(\)\s*=>\s*\{([\s\S]*?)\r?\n\s*\},\r?\n\s*\}\);/
    );

    assert.ok(callbackMatch, "Expected the runtime source onLayersChanged callback.");
    assert.match(variant, /const bindScaleVisibility = \(layers = getAllLayers\(\)\) =>/);
    assert.match(
      variant,
      /const bindMapVisibility = \(layers = getAllLayers\(\)\) => \{[\s\S]*compatibilityDerivedState\.replace\(layers\);[\s\S]*bindScaleVisibility\(layers\);/
    );
    assert.match(callbackMatch[1], /bindScaleVisibility\(\);/);
    assert.doesNotMatch(callbackMatch[1], /bindMapVisibility\(\);/);
    assert.doesNotMatch(callbackMatch[1], /compatibilityDerivedState\.replace/);
  }
});
