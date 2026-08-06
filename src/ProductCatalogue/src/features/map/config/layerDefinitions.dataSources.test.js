import assert from "node:assert/strict";
import test from "node:test";

import { attributesSupportLayerCapability, getLayerDefinition } from "./layerDefinitions.js";

test("compatibility AOI layer keeps existing popup and Product actions", () => {
  const feature = {
    attributes: { datasetName: "DK4TEST" },
    layer: { customId: "aoi" },
  };
  assert.equal(attributesSupportLayerCapability(feature, "supportsPopupActions"), true);
  assert.equal(attributesSupportLayerCapability(feature, "supportsProductActions"), true);
});

test("mock source layers allow frontend filtering and search while actions stay disabled", () => {
  for (const layerId of ["paper-charts-products", "s102-products"]) {
    const definition = getLayerDefinition(layerId);
    assert.ok(definition);

    assert.equal(definition.capabilities.supportsPopup, true);
    assert.equal(definition.capabilities.supportsAttributeFilters, true);
    assert.equal(definition.capabilities.supportsOverlapPicker, true);
    assert.equal(definition.capabilities.supportsProductSearch, true);

    assert.equal(definition.capabilities.supportsPopupActions, false);
    assert.equal(definition.capabilities.supportsProductActions, false);
    assert.equal(definition.capabilities.supportsProductHistory, false);
  }
});

test("source metadata prevents compatibility capability fallback", () => {
  const attributes = {
    sourceId: "s102",
    datasetName: "S102-A",
    edition: 1,
  };

  assert.equal(attributesSupportLayerCapability(attributes, "supportsProductActions"), false);
  assert.equal(attributesSupportLayerCapability(attributes, "supportsPopupActions"), false);
});

test("Graphic capability resolution includes nested layer metadata", () => {
  const feature = {
    attributes: { datasetName: "FUTURE-1", sourceId: "future-source" },
    layer: {
      customId: "future-products",
      appLayerCapabilities: { supportsPopupActions: true },
    },
  };

  assert.equal(attributesSupportLayerCapability(feature, "supportsPopupActions"), true);
});
