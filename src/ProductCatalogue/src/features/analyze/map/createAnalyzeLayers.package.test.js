import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  createWorkspaceProductContext,
  resolveProductContext,
} from "../../products/domain/productContext.js";

async function layerFactory() {
  const source = await readFile(new URL("./createAnalyzeLayers.js", import.meta.url), "utf8");
  const isolated = source
    .replace(
      'import { createLayer } from "../../map/core/layerFactory.js";',
      "const createLayer = (map, definition) => map.createLayer(definition);"
    )
    .replace(
      '"./analyzeGraphicProductContext.js"',
      JSON.stringify(new URL("./analyzeGraphicProductContext.js", import.meta.url).href)
    )
    .replace(
      '"../../map/symbology/correctionSymbolResolver.js"',
      JSON.stringify(
        new URL("../../map/symbology/correctionSymbolResolver.js", import.meta.url).href
      )
    );
  return (await import(`data:text/javascript;base64,${Buffer.from(isolated).toString("base64")}`))
    .createAnalyzeLayers;
}
function context(name, sourceId = "electronic-test") {
  return createWorkspaceProductContext({
    sourceId,
    datasetName: name,
    productKey: name,
    productType: "electronic-product",
    capabilities: { analyze: true },
  });
}
function mapHarness() {
  return {
    layers: [],
    definitions: [],
    async createLayer(definition) {
      this.definitions.push(definition);
      const features = definition.data.features;
      const layer = {
        graphics: features.map((feature) => ({
          attributes: feature.attributes ?? feature.properties,
        })),
      };
      this.layers.push(layer);
      return layer;
    },
    remove(layer) {
      this.layers = this.layers.filter((item) => item !== layer);
    },
  };
}

test("package map pipeline creates only the outer shared Graphic alongside unchanged simple Graphics", async () => {
  const createLayers = await layerFactory();
  const map = mapHarness();
  const packageProduct = {
    datasetName: "Primary",
    edition: 2,
    status: 8,
    workspaceLoadState: "loaded",
    productContext: context("Primary", "s101"),
    aoiGeometry: { x: 10, y: 56 },
    workUnit: { kind: "package", identityKey: "primary-package" },
    members: [{ datasetName: "Primary" }, { datasetName: "Secondary" }],
  };
  const simple = {
    datasetName: "Simple",
    productContext: context("Simple"),
    aoiGeometry: { x: 11, y: 57 },
  };
  const layers = await createLayers(map, [packageProduct, simple]);
  assert.equal(layers.length, 2);
  const packageLayer = layers.find((layer) => layer.appAnalyzeWorkUnitKey === "primary-package");
  const simpleLayer = layers.find((layer) => !layer.appAnalyzeWorkUnitKey);
  assert.deepEqual(
    packageLayer.graphics.map((graphic) => graphic.attributes.datasetName),
    ["Primary"]
  );
  assert.deepEqual(
    simpleLayer.graphics.map((graphic) => graphic.attributes.datasetName),
    ["Simple"]
  );
  assert.equal(
    layers
      .flatMap((layer) => layer.graphics)
      .some((graphic) => graphic.attributes.datasetName === "Secondary"),
    false
  );
  assert.equal(
    resolveProductContext({ graphic: packageLayer.graphics[0] }),
    packageProduct.productContext
  );
  assert.equal(resolveProductContext({ graphic: simpleLayer.graphics[0] }), simple.productContext);
  for (const layer of layers) map.remove(layer);
  const disabled = await createLayers(map, [simple]);
  assert.deepEqual(
    disabled[0].graphics.map((graphic) => graphic.attributes.datasetName),
    ["Simple"]
  );
  for (const layer of disabled) map.remove(layer);
  assert.equal(map.layers.length, 0);
});

test("layer factory failure cleans up already created layers before rejecting publication", async () => {
  const createLayers = await layerFactory();
  const map = mapHarness();
  const original = map.createLayer;
  map.createLayer = async function (definition) {
    if (definition.dataFormat === "geojson") throw new Error("Renderer unavailable");
    return original.call(this, definition);
  };
  const electronic = {
    datasetName: "Primary",
    productContext: context("Primary"),
    aoiGeometry: { x: 10, y: 56 },
  };
  const source = {
    datasetName: "Source",
    productContext: context("Source", "source-test"),
    sourceFeature: {
      type: "Feature",
      geometry: { type: "Point", coordinates: [10, 56] },
      properties: {},
    },
  };
  await assert.rejects(createLayers(map, [electronic, source]), /Renderer unavailable/);
  assert.equal(map.layers.length, 0);
});
