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

const ACTION_IDS = [
  "package-pause-resume",
  "package-discard-export",
  "package-send-accept",
  "tools",
];

function assertSharedActions(selection) {
  const groups = createPopupActionGroups(selection);
  assert.equal(groups.length, 1);
  const actions = groups[0];
  assert.deepEqual(
    actions.map((action) => action.id),
    ACTION_IDS
  );
  assert.deepEqual(
    actions.slice(0, 3).map((action) => action.label),
    ["Pause", "Discard", "Send"]
  );
  assert.deepEqual(
    actions.slice(0, 3).map((action) => action.icon),
    ["pause", "x-circle", "send"]
  );
  for (const action of actions.slice(0, 3)) {
    assert.equal(action.disabled, true);
    assert.equal(action.textEnabled, false);
    assert.equal(action.onClick, undefined);
    assert.equal(action.controlKind, "unavailable-package");
    assert.equal(action.availability.backendAuthorized, null);
    assert.equal(action.availability.dispatchImplemented, false);
    assert.ok(action.disabledReason);
  }
  assert.equal(actions[3].icon, "wrench");
  return actions;
}

test("compatibility Products use the shared workflow row, not legacy Product mutations", () => {
  const selection = createCompatibilitySelection();
  const actions = assertSharedActions({ ...selection, frozen: false });
  assert.deepEqual(
    actions[3].items.map((item) => item.id),
    ["analyze", "review", "history"]
  );
  assert.deepEqual(
    createPopupActionGroups({ ...selection, frozen: true })[0].map((action) => action.id),
    ACTION_IDS
  );
});

test("source-aware Paper Charts and S-102 use the identical row without backend dispatch", () => {
  for (const sourceId of ["paper-charts", "s102"]) {
    const actions = assertSharedActions(createMockSelection(sourceId));
    assert.deepEqual(
      actions[3].items.map((item) => item.id),
      ["analyze", "review", "history"]
    );
    assert.equal(actions[1].onClick, undefined);
  }
});

test("changing Products never retains another source's action eligibility", () => {
  const compatibility = assertSharedActions(createCompatibilitySelection("AOI-1"));
  const paper = assertSharedActions(createMockSelection("paper-charts", "PAPER-1"));
  assert.equal(compatibility[0].availability.dispatchImplemented, false);
  assert.equal(paper[0].availability.dispatchImplemented, false);
  paper[0].isCurrent = () => false;
  assert.equal(paper[0].disabled, true);
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

test("registered Analyze compatibility Graphic also uses shared workflow controls", () => {
  const context = createCompatibilityWorkspaceProductContext("101DK0041154E");
  const actions = assertSharedActions({ ...createAnalyzeSelection(context), frozen: false });
  assert.ok(actions[3].items.some((item) => item.id === "analyze"));
});

test("registered and cloned Analyze source Graphics share controls without mutations", () => {
  for (const [sourceId, productKey, datasetName] of [
    ["paper-charts", "P003", "PAPER-MOCK-P003"],
    ["s102", "S102-ACTION-003", "102DK0041155E"],
  ]) {
    const context = createAnalyzeSourceContext(sourceId, productKey, datasetName);
    const actions = assertSharedActions(createAnalyzeSelection(context, { clone: true }));
    assert.ok(actions[3].items.some((item) => item.id === "analyze"));
  }
});

test("source replacement invalidates old popup workflow and Tools controls", () => {
  const selection = createMockSelection("s102");
  const actions = assertSharedActions(selection);
  assert.equal(actions[0].isCurrent(), true);
  const source = selection.graphic.layer.appSourceDefinition;
  selection.graphic.layer.appSourceDefinition = { ...source };
  assert.equal(actions[0].isCurrent(), false);
  assert.equal(actions[3].isCurrent(), false);
});

test("a fabricated package action session cannot authorize an ordinary Product", () => {
  const selection = createMockSelection("paper-charts");
  const actions = assertSharedActions({
    ...selection,
    packageActions: {
      projection: () => ({
        verified: true,
        actionEligibility: { pause: true, discard: true, send: true },
      }),
      invoke() {
        throw new Error("Unexpected package mutation");
      },
    },
  });
  assert.equal(
    actions.slice(0, 3).every((action) => action.onClick === undefined),
    true
  );
});
