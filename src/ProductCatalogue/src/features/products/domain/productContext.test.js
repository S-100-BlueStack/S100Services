import assert from "node:assert/strict";
import test from "node:test";

import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { PRODUCT_CORRECTIONS_LAYER_ID } from "../../map/config/layerDefinitions.js";
import {
  COMPATIBILITY_PRODUCT_SOURCE_ID,
  PRODUCT_OPERATION_CAPABILITY,
  productContextSupportsCapability,
  resolveProductContext,
} from "./productContext.js";

function createRegisteredGraphic(source, datasetName = "P001") {
  const layerDefinition = source.layerDefinitions[0];
  const layer = {
    customId: layerDefinition.id,
    appLayerId: layerDefinition.id,
    appLayerKind: layerDefinition.layerKind,
    appSourceDefinition: source,
    appSourceId: source.id,
    appSourceLabel: source.label,
    appSourceCapabilities: source.capabilities,
    appProductType: source.productType,
    appExportConfiguration: source.exportConfiguration,
  };
  const graphic = {
    layer,
    attributes: {
      sourceId: source.id,
      sourceLabel: source.label,
      productKey: datasetName,
      productIdentityKey: JSON.stringify([source.id, datasetName]),
      datasetName,
      productType: source.productType,
      layerId: layerDefinition.id,
      layerKind: layerDefinition.layerKind,
    },
  };

  return graphic;
}

test("compatibility AOI Graphic resolves through the explicit compatibility adapter", () => {
  const graphic = {
    attributes: {
      layerId: PRODUCT_CORRECTIONS_LAYER_ID,
      layerKind: "product-corrections",
      datasetName: "101DK0040943E",
    },
  };
  const context = resolveProductContext({ graphic });

  assert.equal(context.sourceId, COMPATIBILITY_PRODUCT_SOURCE_ID);
  assert.equal(context.datasetName, "101DK0040943E");
  assert.equal(context.layerId, PRODUCT_CORRECTIONS_LAYER_ID);
  assert.equal(
    productContextSupportsCapability(context, PRODUCT_OPERATION_CAPABILITY.FREEZE),
    true
  );
});

test("Paper Charts resolves from Graphic and registry-backed layer metadata", () => {
  const source = createDataSourceRegistry({ isDevelopment: true }).byId.get("paper-charts");
  const context = resolveProductContext({ graphic: createRegisteredGraphic(source) });

  assert.equal(context.sourceId, "paper-charts");
  assert.equal(context.productType, "paper-chart");
  assert.equal(context.capabilities.productSearch, true);
  assert.equal(context.capabilities.freeze, false);
});

test("S-102 resolves from Graphic and registry-backed layer metadata", () => {
  const source = createDataSourceRegistry({ isDevelopment: true }).byId.get("s102");
  const context = resolveProductContext({ graphic: createRegisteredGraphic(source, "S102-001") });

  assert.equal(context.sourceId, "s102");
  assert.equal(context.productKey, "S102-001");
  assert.equal(context.capabilities.popupExport, true);
  assert.equal(context.capabilities.exportEdition, false);
});

test("missing or unknown source metadata fails closed", () => {
  assert.equal(
    resolveProductContext({
      graphic: {
        attributes: { sourceId: "unknown", datasetName: "UNKNOWN-001" },
        layer: { customId: "unknown-layer" },
      },
    }),
    null
  );
  assert.equal(
    resolveProductContext({ attributes: { datasetName: "ATTRIBUTE_ONLY_PRODUCT" } }),
    null
  );
  assert.equal(
    resolveProductContext({
      graphic: {
        attributes: {
          sourceId: "unknown",
          productType: "unknown-product",
          productKey: "UNKNOWN-002",
          datasetName: "UNKNOWN-002",
        },
        layer: {
          customId: "unknown-layer",
          appSourceId: "unknown",
          appSourceCapabilities: { popupExport: true },
          appProductType: "unknown-product",
        },
      },
    }),
    null
  );
});

test("refreshed Graphics rebuild Product context and identity", () => {
  const source = createDataSourceRegistry({ isDevelopment: true }).byId.get("paper-charts");
  const first = resolveProductContext({ graphic: createRegisteredGraphic(source, "P001") });
  const refreshed = resolveProductContext({ graphic: createRegisteredGraphic(source, "P002") });

  assert.notEqual(first.identityKey, refreshed.identityKey);
  assert.equal(refreshed.datasetName, "P002");
});
