import assert from "node:assert/strict";
import test from "node:test";

import { createSourceStatusRefreshCoordinator } from "../../dataSources/services/sourceStatusRefreshCoordinator.js";
import { detectPackagePopupStatusDrift } from "./popupSourceStatusDrift.js";
import {
  registerPopupSourceStatusRefreshHandler,
  requestPopupSourceStatusRefresh,
} from "./popupRefreshBridge.js";

function createLayer(primaryStatus) {
  const graphic = {
    attributes: {
      sourceId: "s101",
      datasetName: "101DK001OSTSO",
      featureKey: "s101:101DK001OSTSO",
      workUnitStatus: {
        workflowStatus: 1,
        members: [
          { key: "s101", datasetName: "101DK001OSTSO", status: primaryStatus },
          { key: "s57", datasetName: "DK1OSTSO", status: 1 },
        ],
      },
    },
    geometry: { type: "polygon" },
    symbol: { state: primaryStatus },
  };
  const values = [graphic];
  return {
    customId: "s101-products",
    appLayerId: "s101-products",
    appLayerKind: "electronic-products",
    layerType: "graphics",
    title: "ENC-package",
    appLayerCapabilities: {},
    appSymbolization: {},
    graphics: { toArray: () => [...values] },
    _index: new Map([[graphic.attributes.featureKey, graphic]]),
    removeMany(graphics) {
      for (const item of graphics) {
        const index = values.indexOf(item);
        if (index >= 0) values.splice(index, 1);
      }
    },
    addMany(graphics) {
      values.push(...graphics);
    },
    removeAll() {
      values.length = 0;
    },
  };
}

test("external standalone Discard revalidates only the selected Graphic through its source owner", async () => {
  const currentLayer = createLayer(15);
  const selectedGraphic = currentLayer.graphics.toArray()[0];
  const productContext = {
    sourceId: "s101",
    datasetName: "101DK001OSTSO",
    workUnit: { kind: "package", primaryMemberKey: "s101" },
  };
  const detail = { datasetName: "101DK001OSTSO", status: 1, exportMetadata: { items: [] } };
  const observations = [];
  const coordinator = createSourceStatusRefreshCoordinator({
    dataSourceController: {
      getState(sourceId) {
        return sourceId === "s101"
          ? { enabled: true, requestedEnabled: true, loading: false }
          : null;
      },
      async refreshProductStatus(sourceId, datasetName) {
        observations.push({ sourceId, datasetName });
        const graphic = currentLayer.graphics.toArray()[0];
        graphic.attributes = {
          ...graphic.attributes,
          workUnitStatus: {
            ...graphic.attributes.workUnitStatus,
            members: [
              { key: "s101", datasetName, status: 1 },
              { key: "s57", datasetName: "DK1OSTSO", status: 1 },
            ],
          },
        };
        graphic.symbol = { state: 1 };
        return { success: true, changed: true };
      },
    },
  });
  const unregister = registerPopupSourceStatusRefreshHandler(coordinator.request);
  try {
    const observation = detectPackagePopupStatusDrift({
      productContext,
      attributes: selectedGraphic.attributes,
      detail,
    });
    assert.deepEqual(observation, { sourceId: "s101", datasetName: "101DK001OSTSO" });

    // Product-detail did not mutate the selected AOI Graphic before source reload.
    assert.equal(selectedGraphic.attributes.workUnitStatus.members[0].status, 15);
    assert.equal(selectedGraphic.symbol.state, 15);
    const refreshed = await requestPopupSourceStatusRefresh(observation);
    assert.equal(refreshed[0].value.success, true);
    assert.equal(currentLayer.graphics.toArray()[0], selectedGraphic);
    assert.equal(selectedGraphic.attributes.workUnitStatus.members[0].status, 1);
    assert.equal(selectedGraphic.attributes.workUnitStatus.members[1].status, 1);
    assert.equal(selectedGraphic.symbol.state, 1);
    assert.equal(observations.length, 1);
    assert.deepEqual(observations[0], { sourceId: "s101", datasetName: "101DK001OSTSO" });
    assert.equal(
      detectPackagePopupStatusDrift({
        productContext,
        attributes: selectedGraphic.attributes,
        detail,
      }),
      null
    );
  } finally {
    unregister();
    coordinator.destroy();
  }
});
