import assert from "node:assert/strict";
import test from "node:test";

import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { LAYER_KINDS, PRODUCT_CORRECTIONS_LAYER_ID } from "../config/layerDefinitions.js";
import {
  COMPATIBILITY_PRODUCT_SOURCE_ID,
  createCompatibilityWorkspaceProductContext,
  createProductContextIdentityAttributes,
  createWorkspaceProductContext,
  resolveProductContext,
} from "../../products/domain/productContext.js";
import {
  createProductContextLookup,
  registerAnalyzeGraphicProductContexts,
} from "../../analyze/map/analyzeGraphicProductContext.js";
import { createPopupActionGroups } from "./popupActionConfig.js";

function createCompatibilitySelection(datasetName = "AOI-ACTION-001") {
  const graphic = {
    layer: {
      customId: PRODUCT_CORRECTIONS_LAYER_ID,
      appLayerId: PRODUCT_CORRECTIONS_LAYER_ID,
      appLayerKind: LAYER_KINDS.PRODUCT_CORRECTIONS,
    },
    attributes: {
      layerId: PRODUCT_CORRECTIONS_LAYER_ID,
      layerKind: LAYER_KINDS.PRODUCT_CORRECTIONS,
      datasetName,
      status: "Idle",
    },
  };
  return {
    graphic,
    attributes: graphic.attributes,
    productContext: resolveProductContext({ graphic }),
  };
}

function createMockSelection(sourceId, datasetName = `${sourceId}-ACTION-001`) {
  const source = createDataSourceRegistry({ isDevelopment: true }).byId.get(sourceId);
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
      status: "Idle",
    },
  };
  return {
    graphic,
    attributes: graphic.attributes,
    productContext: resolveProductContext({ graphic }),
  };
}

function createAnalyzeSelection(productContext, { clone = false } = {}) {
  const layerId =
    productContext.sourceId === COMPATIBILITY_PRODUCT_SOURCE_ID
      ? "analyze-products"
      : "analyze-source-products";
  const sourceFeatureKey = `analyze:${productContext.identityKey}:0`;
  const identityAttributes = createProductContextIdentityAttributes(productContext);
  const entry = {
    featureKey: sourceFeatureKey,
    productContext,
    feature: {
      attributes: {
        ...identityAttributes,
        featureKey: sourceFeatureKey,
      },
    },
  };
  const registeredGraphic = {
    layer: {
      customId: layerId,
      appLayerId: layerId,
      appLayerKind: "analyze-products",
    },
    attributes: {
      ...identityAttributes,
      // Match the map transformer's post-layer featureKey while Product identity stays unchanged.
      featureKey: `${layerId}:${sourceFeatureKey}`,
      status: "Idle",
    },
  };

  registerAnalyzeGraphicProductContexts(
    { graphics: [registeredGraphic] },
    createProductContextLookup([entry])
  );

  const graphic = clone
    ? {
        layer: { ...registeredGraphic.layer },
        attributes: { ...registeredGraphic.attributes },
      }
    : registeredGraphic;

  return {
    graphic,
    attributes: graphic.attributes,
    productContext: resolveProductContext({ graphic }),
  };
}

function createAnalyzeSourceContext(sourceId, productKey, datasetName) {
  const source = createDataSourceRegistry({ isDevelopment: true }).byId.get(sourceId);
  return createWorkspaceProductContext({
    sourceId: source.id,
    sourceLabel: source.label,
    productKey,
    datasetName,
    productType: source.productType,
    capabilities: source.capabilities,
    exportConfiguration: source.exportConfiguration,
    contentConfiguration: source.contentConfiguration,
  });
}

const flattenActions = (groups) => groups.flatMap((group) => group);

test("compatibility AOI retains mutation actions and simplified Export leaves", () => {
  const actions = flattenActions(
    createPopupActionGroups({ ...createCompatibilitySelection(), frozen: false })
  );
  const exportAction = actions.find((action) => action.id === "export");
  const tools = actions.find((action) => action.id === "tools");
  assert.ok(actions.some((action) => action.id === "freeze-feature"));
  assert.ok(actions.some((action) => action.id === "send-immediately"));
  assert.ok(actions.some((action) => action.id === "rollback"));
  assert.deepEqual(
    exportAction.items.map((item) => item.label),
    ["Edition", "Update"]
  );
  assert.deepEqual(
    tools.items.map((item) => item.id),
    ["analyze", "history"]
  );
});

test("Paper Charts exposes safe Export placeholders plus Analyze and History surfaces only", () => {
  const actions = flattenActions(createPopupActionGroups(createMockSelection("paper-charts")));
  assert.deepEqual(
    actions.map((action) => action.id),
    ["export", "tools"]
  );
  assert.equal(
    actions.some((action) => action.id === "freeze-feature"),
    false
  );
  assert.equal(
    actions.some((action) => action.id === "send-immediately"),
    false
  );
  assert.equal(
    actions.some((action) => action.id === "rollback"),
    false
  );
  assert.equal(
    actions[0].items.every((item) => item.disabled && item.onClick === undefined),
    true
  );
  assert.deepEqual(
    actions[1].items.map((item) => item.id),
    ["analyze", "history"]
  );
});

test("S-102 exposes safe Export placeholders plus Analyze and History surfaces only", () => {
  const actions = flattenActions(createPopupActionGroups(createMockSelection("s102")));
  assert.deepEqual(
    actions.map((action) => action.id),
    ["export", "tools"]
  );
  assert.match(actions[0].items[0].disabledReason, /S-102 export is not available yet/);
  assert.deepEqual(
    actions[1].items.map((item) => item.id),
    ["analyze", "history"]
  );
});

test("switching selected Product rebuilds action configuration without stale mutation actions", () => {
  const compatibility = flattenActions(
    createPopupActionGroups({ ...createCompatibilitySelection("AOI-1"), frozen: false })
  );
  const paper = flattenActions(
    createPopupActionGroups(createMockSelection("paper-charts", "PAPER-1"))
  );
  assert.equal(
    compatibility.some((action) => action.id === "freeze-feature"),
    true
  );
  assert.equal(
    paper.some((action) => action.id === "freeze-feature"),
    false
  );
  assert.equal(
    paper.some((action) => action.id === "tools"),
    true
  );
});

test("unknown Product context fails closed with no actions", () => {
  assert.deepEqual(
    createPopupActionGroups({
      attributes: { datasetName: "UNKNOWN", sourceId: "unknown" },
      graphic: { layer: { customId: "unknown-layer" } },
    }),
    []
  );
});

test("registered Analyze compatibility Graphic retains compatibility action groups", () => {
  const context = createCompatibilityWorkspaceProductContext("101DK0041154E");
  const actions = flattenActions(
    createPopupActionGroups({
      ...createAnalyzeSelection(context),
      frozen: false,
    })
  );

  assert.ok(actions.some((action) => action.id === "freeze-feature"));
  assert.ok(actions.some((action) => action.id === "send-immediately"));
  assert.ok(actions.some((action) => action.id === "export"));
  assert.ok(actions.some((action) => action.id === "rollback"));
  assert.ok(actions.some((action) => action.id === "tools"));
});

test("registered and cloned Analyze mock Graphics retain safe action groups", () => {
  for (const [sourceId, productKey, datasetName] of [
    ["paper-charts", "P003", "PAPER-MOCK-P003"],
    ["s102", "S102-ACTION-003", "102DK0041155E"],
  ]) {
    const context = createAnalyzeSourceContext(sourceId, productKey, datasetName);
    const actions = flattenActions(
      createPopupActionGroups(createAnalyzeSelection(context, { clone: true }))
    );

    assert.deepEqual(
      actions.map((action) => action.id),
      ["export", "tools"]
    );
    assert.equal(
      actions[0].items.every((item) => item.disabled),
      true
    );
    assert.equal(
      actions[1].items.some((item) => item.id === "analyze"),
      true
    );
  }
});
