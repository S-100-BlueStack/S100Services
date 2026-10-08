import { readFile } from "node:fs/promises";

// Replace only SDK constructors and the public layer factory. Attribute
// transformation, initial symbol selection and F2 rendering stay production code.
export async function loadAnalyzeMapTestPipeline(createLayer) {
  const transformerUrl = new URL("../../map/transformers/esriJsonToGraphics.js", import.meta.url);
  const source = await readFile(transformerUrl, "utf8");
  const sdkConstructors = {
    Graphic: "class Graphic { constructor(properties) { Object.assign(this, properties); } }",
    Polygon: 'class Polygon { static fromJSON(json) { return { ...json, type: "polygon" }; } }',
    Polyline: 'class Polyline { static fromJSON(json) { return { ...json, type: "polyline" }; } }',
    Point: 'class Point { static fromJSON(json) { return { ...json, type: "point" }; } }',
  };
  const transformerSource = source.replace(
    /import (\w+) from "@arcgis\/core\/[^"]+";/g,
    (_, name) => sdkConstructors[name]
  );
  const transformer = await importSource(transformerSource, transformerUrl);
  const layerUrl = new URL("./createAnalyzeLayers.js", import.meta.url);
  const layerSource = await readFile(layerUrl, "utf8");
  const token = `__analyzeMapFactory${Math.random().toString(36).slice(2)}`;
  globalThis[token] = createLayer;
  try {
    const isolated = layerSource.replace(
      'import { createLayer } from "../../map/core/layerFactory.js";',
      `const createLayer = globalThis[${JSON.stringify(token)}];`
    );
    const pipeline = await importSource(isolated, layerUrl);
    return {
      createAnalyzeLayers: pipeline.createAnalyzeLayers,
      esriJsonToGraphics: transformer.esriJsonToGraphics,
    };
  } finally {
    delete globalThis[token];
  }
}

async function importSource(source, moduleUrl) {
  const absoluteImports = source.replace(
    /from "(\.[^"]+)"/g,
    (_, specifier) => `from ${JSON.stringify(new URL(specifier, moduleUrl).href)}`
  );
  return import(`data:text/javascript;base64,${Buffer.from(absoluteImports).toString("base64")}`);
}
