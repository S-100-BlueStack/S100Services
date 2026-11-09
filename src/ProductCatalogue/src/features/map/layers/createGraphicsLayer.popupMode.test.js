import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function loadFactory() {
  const source = await readFile(new URL("./createGraphicsLayer.js", import.meta.url), "utf8");
  const namespace = `__graphicsLayerPopupModeTest${Math.random().toString(36).slice(2)}`;
  const captured = [];
  class GraphicsLayer {
    constructor(properties) {
      Object.assign(this, properties);
    }

    addMany(graphics) {
      this.graphics = [...(this.graphics ?? []), ...graphics];
    }
  }
  globalThis[namespace] = {
    GraphicsLayer,
    resolveLayerCapabilities: () => ({}),
    resolveLayerKind: () => null,
    createLayerIndexAsync: async () => new Map(),
    createPopup: (options) => {
      captured.push(options);
      return { readOnly: options.readOnly };
    },
    geoJsonToGraphics: () => [],
    esriJsonToGraphics: () => [],
  };
  const isolated = source
    .replace(
      'import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";',
      `const GraphicsLayer = globalThis[${JSON.stringify(namespace)}].GraphicsLayer;`
    )
    .replace(
      /import\s+([\s\S]*?)\s+from\s+"[^"]+";/g,
      (_, bindings) => `const ${bindings} = globalThis[${JSON.stringify(namespace)}];`
    );
  try {
    const module = await import(
      `data:text/javascript;base64,${Buffer.from(isolated).toString("base64")}`
    );
    return { createGraphicsLayer: module.createGraphicsLayer, captured };
  } finally {
    delete globalThis[namespace];
  }
}

test("Analyze gets a read-only popup without changing the default Main Map popup", async () => {
  const { createGraphicsLayer, captured } = await loadFactory();
  const map = {
    layers: [],
    add(layer) {
      this.layers.push(layer);
    },
  };
  const regular = await createGraphicsLayer(map, {
    id: "normal",
    data: { type: "FeatureCollection", features: [] },
  });
  const analyze = await createGraphicsLayer(map, {
    id: "analyze",
    popupReadOnly: true,
    data: { type: "FeatureCollection", features: [] },
  });
  assert.deepEqual(captured, [{ readOnly: false }, { readOnly: true }]);
  assert.equal(regular.popupTemplate.readOnly, false);
  assert.equal(analyze.popupTemplate.readOnly, true);
  assert.deepEqual(map.layers, [regular, analyze]);
});
