import assert from "node:assert/strict";
import test from "node:test";

import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { PRODUCT_CORRECTIONS_LAYER_ID } from "../config/layerDefinitions.js";
import { resolveProductContext } from "../../products/domain/productContext.js";
import { createPopupActionGroups } from "./popupActionConfig.js";

function createCompatibilitySelection(datasetName = "AOI-ACTION-001") {
  const attributes = {
    layerId: PRODUCT_CORRECTIONS_LAYER_ID,
    layerKind: "product-corrections",
    datasetName,
    status: "Idle",
  };
  return {
    attributes,
    productContext: resolveProductContext({ attributes }),
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

function flattenActions(groups) {
  return groups.flatMap((group) => group);
}

test("compatibility AOI retains mutation actions and simplified Export leaves", () => {
  const selection = createCompatibilitySelection();
  const actions = flattenActions(
    createPopupActionGroups({
      ...selection,
      frozen: false,
    })
  );
  const exportAction = actions.find((action) => action.id === "export");

  assert.ok(actions.some((action) => action.id === "freeze-feature"));
  assert.ok(actions.some((action) => action.id === "send-immediately"));
  assert.ok(actions.some((action) => action.id === "rollback"));
  assert.deepEqual(
    exportAction.items.map((item) => item.label),
    ["Edition", "Update"]
  );
  assert.equal(exportAction.items[0].disabled, false);
  assert.equal(exportAction.items[1].disabled, true);
});

test("search-selected Paper Charts Product cannot bypass mutation capabilities", () => {
  const selection = createMockSelection("paper-charts");
  const actions = flattenActions(createPopupActionGroups(selection));

  assert.deepEqual(
    actions.map((action) => action.id),
    ["export"]
  );
  assert.deepEqual(
    actions[0].items.map((item) => item.label),
    ["Edition", "Update"]
  );
  assert.equal(
    actions[0].items.every((item) => item.disabled),
    true
  );
  assert.equal(
    actions[0].items.every((item) => item.onClick === undefined),
    true
  );
});

test("S-102 exposes only disabled Export placeholders", () => {
  const selection = createMockSelection("s102");
  const actions = flattenActions(createPopupActionGroups(selection));

  assert.deepEqual(
    actions.map((action) => action.id),
    ["export"]
  );
  assert.equal(actions[0].items.length, 2);
  assert.match(actions[0].items[0].disabledReason, /S-102 export is not available yet/);
});

test("switching selected Product rebuilds action configuration without stale actions", () => {
  const compatibilityActions = flattenActions(
    createPopupActionGroups({ ...createCompatibilitySelection("AOI-SWITCH-001"), frozen: false })
  );
  const mockActions = flattenActions(
    createPopupActionGroups(createMockSelection("paper-charts", "PAPER-SWITCH-001"))
  );
  const restoredActions = flattenActions(
    createPopupActionGroups({ ...createCompatibilitySelection("AOI-SWITCH-002"), frozen: false })
  );

  assert.ok(compatibilityActions.some((action) => action.id === "freeze-feature"));
  assert.equal(
    mockActions.some((action) => action.id === "freeze-feature"),
    false
  );
  assert.ok(restoredActions.some((action) => action.id === "freeze-feature"));
});

test("repeated rendering produces one Export root with two leaves", () => {
  const selection = createMockSelection("paper-charts", "PAPER-REPEAT-001");

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actions = flattenActions(createPopupActionGroups(selection));
    assert.deepEqual(
      actions.map((action) => action.id),
      ["export"]
    );
    assert.deepEqual(
      actions[0].items.map((item) => item.id),
      ["export-edition", "export-update"]
    );
  }
});

test("unknown Product context fails closed with no actions", () => {
  assert.deepEqual(
    createPopupActionGroups({
      attributes: { datasetName: "UNKNOWN-001", sourceId: "unknown" },
      graphic: { layer: { customId: "unknown-layer" } },
    }),
    []
  );
});
