import assert from "node:assert/strict";
import test from "node:test";
import { loadAnalyzeMapTestPipeline } from "./analyzeMapTestSupport.js";
import {
  createWorkspaceProductContext,
  resolveProductContext,
} from "../../products/domain/productContext.js";
import { projectMemberStatusRenderState } from "../../dataSources/domain/memberStatusRenderingProjection.js";
import {
  getCorrectionSymbol,
  getMixedCorrectionSymbol,
} from "../../map/symbology/correctionSymbols.js";
import { WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION } from "../../map/symbology/correctionSymbolResolver.js";

const polygon = {
  rings: [
    [
      [10, 56],
      [11, 56],
      [11, 57],
      [10, 56],
    ],
  ],
  spatialReference: { wkid: 4326 },
};
function packageProduct(statuses, representativeStatus = statuses[0]) {
  const members = statuses.map((status, index) => ({
    datasetName: index ? "Mapped legacy" : "Primary harbour",
    memberKey: index ? "s57" : "s101",
    status,
    workspaceLoadState: "loaded",
    edition: 1,
    productContext: createWorkspaceProductContext({
      sourceId: index ? "s57" : "s101",
      datasetName: index ? "Mapped legacy" : "Primary harbour",
      productKey: index ? "Mapped legacy" : "Primary harbour",
      productType: "electronic-product",
      capabilities: { analyze: true },
    }),
  }));
  return {
    ...members[0],
    status: representativeStatus,
    aoiGeometry: polygon,
    workUnit: {
      kind: "package",
      identityKey: "package-harbour",
      primaryMemberKey: "s101",
      members: members.map((member) => ({
        key: member.memberKey,
        datasetName: member.datasetName,
      })),
    },
    members,
  };
}
async function render(products) {
  const map = {
    layers: [],
    add(layer) {
      this.layers.push(layer);
    },
    remove(layer) {
      this.layers = this.layers.filter((item) => item !== layer);
    },
  };
  const definitions = [];
  const pipeline = await loadAnalyzeMapTestPipeline(async (target, definition) => {
    definitions.push(definition);
    const layer = {
      appSymbolization: definition.symbolization ?? null,
      graphics: pipeline.esriJsonToGraphics(definition.data, {
        layerId: definition.id,
        symbolization: definition.symbolization,
      }),
    };
    layer.graphics.forEach((graphic) => {
      graphic.layer = layer;
    });
    target.add(layer);
    return layer;
  });
  const layers = await pipeline.createAnalyzeLayers(map, products);
  return { layers, definitions };
}

test("different Analyze member statuses render one existing F2 CIM hatch Graphic", async (t) => {
  const product = packageProduct([8, 11]);
  assert.deepEqual(
    product.members.map((member) => member.status),
    [8, 11]
  );
  const { layers } = await render([product]);
  assert.equal(layers.length, 1);
  assert.equal(layers[0].graphics.length, 1);
  const graphic = layers[0].graphics[0];
  assert.equal(graphic.attributes.status, 8);
  t.diagnostic(
    JSON.stringify({
      modelStatuses: product.members.map((member) => member.status),
      graphics: layers[0].graphics.length,
      representativeStatus: graphic.attributes.status,
      symbolType: graphic.symbol.type,
    })
  );
  if (graphic.symbol.type === "simple-fill")
    assert.deepEqual(graphic.symbol, getCorrectionSymbol(8));
  // Check the rendered symbol first so controlled v3 proves scalar fallback,
  // rather than failing only because its configuration projection is absent.
  assert.equal(
    graphic.symbol.type,
    "cim",
    "One shared polygon must use F2 mixed rendering, not the representative scalar symbol"
  );
  assert.deepEqual(graphic.symbol, getMixedCorrectionSymbol([8, 11]));
  assert.ok(graphic.symbol.data.symbol.symbolLayers.some((layer) => layer.type === "CIMHatchFill"));
  assert.equal(layers[0].appSymbolization, WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION);
  assert.deepEqual(graphic.attributes.workUnitStatus, {
    members: [
      { key: "s101", datasetName: "Primary harbour", status: 8 },
      { key: "s57", datasetName: "Mapped legacy", status: 11 },
    ],
  });
  assert.equal(resolveProductContext({ graphic }), product.productContext);
  assert.equal(graphic.attributes.datasetName, product.datasetName);
  assert.equal(
    graphic.attributes.featureKey,
    `analyze-package:${product.workUnit.identityKey}:analyze:${product.productContext.identityKey}:0`
  );
  assert.deepEqual(graphic.geometry.rings, polygon.rings);
  assert.equal(
    layers
      .flatMap((layer) => layer.graphics)
      .some((item) => item.attributes.datasetName === "Mapped legacy"),
    false
  );
});

for (const [statuses, representative, expectedStatus] of [
  [[11, 11], 11, 11],
  [[8, undefined], 8, 8],
  [[null, 11], null, 11],
  [[null, undefined], null, null],
]) {
  test(`Analyze package scalar rendering uses supplied member state ${JSON.stringify(statuses)}`, async () => {
    const product = packageProduct(statuses, representative);
    product.workUnitStatus = { workflowStatus: 15, members: [{ status: 15 }] };
    const originalMembers = structuredClone(product.members);
    const { layers } = await render([product]);
    const graphic = layers[0].graphics[0];
    assert.equal(layers[0].graphics.length, 1);
    assert.equal(layers[0].appSymbolization, WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION);
    assert.deepEqual(
      graphic.attributes.workUnitStatus.members.map((member) => member.status),
      statuses
    );
    assert.equal(Object.hasOwn(graphic.attributes.workUnitStatus, "workflowStatus"), false);
    assert.deepEqual(
      projectMemberStatusRenderState({
        representativeStatus: representative,
        workUnitStatus: graphic.attributes.workUnitStatus,
      }),
      {
        kind: "scalar",
        status: statuses.every((status) => status == null)
          ? representative
          : String(expectedStatus),
        memberStatuses: statuses.every((status) => status == null) ? [] : [String(expectedStatus)],
      }
    );
    assert.deepEqual(graphic.symbol, getCorrectionSymbol(expectedStatus));
    assert.equal(graphic.symbol.type, "simple-fill");
    assert.deepEqual(product.members, originalMembers);
  });
}

test("ordinary Analyze layers retain scalar rendering alongside member-aware package layers", async () => {
  const packageValue = packageProduct([8, 11]);
  const simple = {
    datasetName: "Ordinary chart",
    status: 8,
    aoiGeometry: polygon,
    productContext: createWorkspaceProductContext({
      sourceId: "ordinary-test",
      datasetName: "Ordinary chart",
      productKey: "Ordinary chart",
      productType: "simple-product",
      capabilities: { analyze: true },
    }),
    workUnitStatus: { members: [{ status: 8 }, { status: 11 }] },
  };
  const { layers, definitions } = await render([packageValue, simple]);
  const ordinary = layers.find((layer) => !layer.appAnalyzeWorkUnitKey);
  assert.equal(layers.length, 2);
  assert.equal(ordinary.graphics.length, 1);
  assert.equal(ordinary.appSymbolization, null);
  assert.equal(
    Object.hasOwn(
      definitions.find((definition) => definition.id === "analyze-products"),
      "symbolization"
    ),
    false
  );
  assert.equal(ordinary.graphics[0].attributes.workUnitStatus, undefined);
  assert.deepEqual(ordinary.graphics[0].symbol, getCorrectionSymbol(8));
  assert.equal(resolveProductContext({ graphic: ordinary.graphics[0] }), simple.productContext);
});
