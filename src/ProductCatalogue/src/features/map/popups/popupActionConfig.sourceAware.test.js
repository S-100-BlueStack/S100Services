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
import { beginPopupExportAction, endPopupExportAction } from "./popupExportState.js";

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

test("compatibility AOI keeps Freeze/Send in the first row and Export/Cancel Export/Tools in the second", () => {
  const groups = createPopupActionGroups({ ...createCompatibilitySelection(), frozen: false });
  const actions = flattenActions(groups);
  const exportAction = actions.find((action) => action.id === "export");
  const tools = actions.find((action) => action.id === "tools");
  const cancelExportAction = actions.find((action) => action.id === "rollback");

  assert.deepEqual(
    groups.map((group) => group.map((action) => action.id)),
    [
      ["freeze-feature", "send-immediately"],
      ["export", "rollback", "tools"],
    ]
  );
  assert.ok(cancelExportAction);
  assert.equal(cancelExportAction.label, "Cancel Export");
  assert.equal(cancelExportAction.icon, "x-circle");
  assert.equal(exportAction.label, "Export...");
  assert.equal(exportAction.helpText, "Open S-101 export actions.");
  assert.deepEqual(
    exportAction.items.map((item) => item.label),
    ["Edition", "Update"]
  );
  assert.equal(exportAction.items[0].helpText, "Export a new S-101 Edition for this product.");
  assert.equal(tools.label, "Tools");
  assert.equal(tools.ariaLabel, "Tools");
  assert.equal(tools.icon, "wrench");
  assert.equal(tools.textEnabled, false);
  assert.deepEqual(
    tools.items.map((item) => item.id),
    ["analyze", "history"]
  );
});

test("frozen compatibility AOI keeps Unfreeze/Send separate from Export/Cancel Export/Tools", () => {
  const groups = createPopupActionGroups({ ...createCompatibilitySelection(), frozen: true });

  assert.deepEqual(
    groups.map((group) => group.map((action) => action.id)),
    [
      ["unfreeze-feature", "send-immediately"],
      ["export", "rollback", "tools"],
    ]
  );
});

test("compatibility local Edition loading uses S-101 presentation without changing the S100 scope", () => {
  if (!globalThis.document) {
    globalThis.document = new EventTarget();
  }

  const selection = createCompatibilitySelection("AOI-RUNNING-001");
  const started = beginPopupExportAction({
    productContext: selection.productContext,
    datasetName: selection.productContext.datasetName,
    scope: "S100",
    exportType: "Edition",
    presentationLabel: "S-101 Edition",
  });

  try {
    const groups = createPopupActionGroups({ ...selection, frozen: false });
    const actions = flattenActions(groups);
    const exportAction = actions.find((action) => action.id === "export");
    const edition = exportAction.items.find((item) => item.id === "export-edition");

    assert.equal(started.started, true);
    assert.equal(exportAction.label, "Exporting...");
    assert.deepEqual(
      groups.map((group) => group.map((action) => action.id)),
      [
        ["freeze-feature", "send-immediately"],
        ["export", "rollback", "tools"],
      ]
    );
    assert.equal(edition.label, "Exporting S-101 Edition");
    assert.match(edition.disabledReason, /S-101 Edition/);
    assert.doesNotMatch(edition.disabledReason, /S100/);
  } finally {
    endPopupExportAction(started.key);
  }
});

test("Paper Charts keeps source-specific Export parent help and safe placeholder leaves", () => {
  const groups = createPopupActionGroups(createMockSelection("paper-charts"));
  const actions = flattenActions(groups);
  const exportAction = actions.find((action) => action.id === "export");
  const tools = actions.find((action) => action.id === "tools");
  assert.deepEqual(
    groups.map((group) => group.map((action) => action.id)),
    [["export", "tools"]]
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
  assert.equal(exportAction.helpText, "Paper Charts export is not available yet.");
  assert.equal(
    exportAction.items.every((item) => item.disabled && item.onClick === undefined),
    true
  );
  assert.match(exportAction.items[0].disabledReason, /Paper Charts export is not available yet/);
  assert.match(exportAction.items[1].disabledReason, /Paper Charts export is not available yet/);
  assert.equal(tools.icon, "wrench");
  assert.equal(tools.ariaLabel, "Tools");
  assert.equal(tools.textEnabled, false);
  assert.deepEqual(
    tools.items.map((item) => item.id),
    ["analyze", "history"]
  );
});

test("S-102 keeps source-specific Export parent help and safe placeholder leaves", () => {
  const groups = createPopupActionGroups(createMockSelection("s102"));
  const actions = flattenActions(groups);
  const exportAction = actions.find((action) => action.id === "export");
  const tools = actions.find((action) => action.id === "tools");
  assert.deepEqual(
    groups.map((group) => group.map((action) => action.id)),
    [["export", "tools"]]
  );
  assert.equal(exportAction.helpText, "S-102 export is not available yet.");
  assert.match(exportAction.items[0].disabledReason, /S-102 export is not available yet/);
  assert.match(exportAction.items[1].disabledReason, /S-102 export is not available yet/);
  assert.equal(tools.icon, "wrench");
  assert.equal(tools.ariaLabel, "Tools");
  assert.equal(tools.textEnabled, false);
  assert.deepEqual(
    tools.items.map((item) => item.id),
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
    const groups = createPopupActionGroups(createAnalyzeSelection(context, { clone: true }));
    const actions = flattenActions(groups);

    assert.deepEqual(
      groups.map((group) => group.map((action) => action.id)),
      [["export", "tools"]]
    );
    const exportAction = actions.find((action) => action.id === "export");
    const tools = actions.find((action) => action.id === "tools");
    assert.equal(
      exportAction.items.every((item) => item.disabled),
      true
    );
    assert.equal(
      tools.items.some((item) => item.id === "analyze"),
      true
    );
  }
});
