import assert from "node:assert/strict";
import test from "node:test";

import {
  getCorrectionSymbol,
  getMixedCorrectionSymbol,
  hasCorrectionStatusColor,
} from "./correctionSymbols.js";

test("keeps the baseline scalar symbol shape and alpha behavior", () => {
  assert.deepEqual(getCorrectionSymbol(8), {
    type: "simple-fill",
    color: "rgba(205, 140, 30, 0.15)",
    outline: {
      color: "rgba(205, 140, 30, 0.7)",
      width: 1,
    },
  });
});

test("creates a public multi-layer CIM symbol that exposes both mixed status colors", () => {
  const symbol = getMixedCorrectionSymbol([1, 15]);

  assert.equal(symbol.type, "cim");
  assert.equal(symbol.data.type, "CIMSymbolReference");
  assert.equal(symbol.data.symbol.type, "CIMPolygonSymbol");
  assert.deepEqual(symbol.data.symbol.symbolLayers, [
    {
      type: "CIMSolidStroke",
      enable: true,
      capStyle: "Round",
      joinStyle: "Round",
      miterLimit: 10,
      width: 1,
      color: [115, 125, 120, 179],
    },
    {
      type: "CIMHatchFill",
      enable: true,
      lineSymbol: {
        type: "CIMLineSymbol",
        symbolLayers: [
          {
            type: "CIMSolidStroke",
            enable: true,
            capStyle: "Butt",
            joinStyle: "Miter",
            miterLimit: 10,
            width: 3,
            color: [220, 45, 45, 166],
          },
        ],
      },
      rotation: 45,
      separation: 8,
    },
    {
      type: "CIMSolidFill",
      enable: true,
      color: [115, 125, 120, 89],
    },
  ]);
});

test("mixed symbol status order is deterministic and additional statuses get distinct hatch angles", () => {
  const first = getMixedCorrectionSymbol([8, 1, 15]);
  const reordered = getMixedCorrectionSymbol([15, "8", "1"]);

  assert.deepEqual(reordered, first);

  const layers = first.data.symbol.symbolLayers;
  const hatches = layers.filter((layer) => layer.type === "CIMHatchFill");

  assert.equal(hatches.length, 2);
  assert.deepEqual(
    hatches.map((layer) => layer.rotation),
    [30, 150]
  );
  assert.deepEqual(hatches[0].lineSymbol.symbolLayers[0].color, [220, 45, 45, 166]);
  assert.deepEqual(hatches[1].lineSymbol.symbolLayers[0].color, [205, 140, 30, 166]);
});

test("unknown statuses retain the existing black fallback without inventing palette colors", () => {
  assert.equal(hasCorrectionStatusColor("future-status"), false);

  const symbol = getMixedCorrectionSymbol(["future-a", "future-b"]);
  const layers = symbol.data.symbol.symbolLayers;
  const hatch = layers.find((layer) => layer.type === "CIMHatchFill");
  const fill = layers.find((layer) => layer.type === "CIMSolidFill");

  assert.deepEqual(hatch.lineSymbol.symbolLayers[0].color, [0, 0, 0, 166]);
  assert.deepEqual(fill.color, [0, 0, 0, 89]);
});
