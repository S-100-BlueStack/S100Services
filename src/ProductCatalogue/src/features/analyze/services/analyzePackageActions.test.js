import assert from "node:assert/strict";
import test from "node:test";
import { createAnalyzePackageActions, resolvePackageIdentity } from "./analyzePackageActions.js";
import {
  createWorkspaceProductContext,
  createProductContextIdentityAttributes,
  registerGraphicProductContext,
} from "../../products/domain/productContext.js";

const memberNames = ["101DK001A", "101DK001A-S57"];
function packageProduct({ active = true, memberName = memberNames[1] } = {}) {
  const members = [
    { key: "s101", datasetName: memberNames[0], sourceId: "s101", exportStandard: "S101" },
    { key: "s57", datasetName: memberNames[1], sourceId: "s57", exportStandard: "S57" },
  ];
  return {
    datasetName: memberNames[0],
    workspaceLoadState: "loaded",
    workUnit: {
      kind: "package",
      identityKey: "package:s101:101DK001A",
      primaryMemberKey: "s101",
      members,
    },
    productContext: {
      identityKey: "source:s101:101DK001A",
      datasetName: memberNames[0],
      sourceId: "s101",
      workUnit: { kind: "package" },
      data: {
        attributes: {
          hasActivePackage: active,
          workUnitMetadata: {
            members: {
              s101: { datasetName: memberNames[0] },
              s57: { datasetName: memberNames[1] },
            },
          },
        },
      },
    },
    members: [
      { memberKey: "s101", datasetName: memberNames[0], productContext: { sourceId: "s101" } },
      { memberKey: "s57", datasetName: memberName, productContext: { sourceId: "s57" } },
    ],
  };
}

function harness({ active = true, permission = { pause: true, discard: true, send: false } } = {}) {
  let product = packageProduct({ active });
  let enabled = true;
  let confirmation;
  const sessions = [];
  const refreshes = [];
  const warnings = [];
  const projection = {
    verified: true,
    liveVerified: true,
    identityKey: product.productContext.identityKey,
    paused: false,
    primaryAction: "send",
    actionEligibility: { resume: false, accept: false, ...permission },
    eligibleMembers: [{ key: "s101", datasetName: memberNames[0] }],
  };
  const manager = createAnalyzePackageActions({
    getProduct: (key) => (key === product?.workUnit.identityKey ? product : null),
    isEnabled: () => enabled,
    refreshProduct: async (name) => {
      refreshes.push(name);
      return true;
    },
    createSession: (config) => {
      const instance = {
        config,
        starts: 0,
        invokes: [],
        destroyed: 0,
        start: async () => {
          instance.starts++;
        },
        projection: () => projection,
        invoke: async (operation) => {
          instance.invokes.push(operation);
          return true;
        },
        destroy: () => {
          instance.destroyed++;
        },
      };
      sessions.push(instance);
      return instance;
    },
    confirmDiscard: () =>
      new Promise((resolve) => {
        confirmation = resolve;
      }),
    warn: (...args) => warnings.push(args),
  });
  return {
    manager,
    sessions,
    projection,
    refreshes,
    warnings,
    get product() {
      return product;
    },
    setProduct: (next) => {
      product = next;
    },
    setEnabled: (value) => {
      enabled = value;
    },
    resolveConfirm: (value) => confirmation(value),
    sync: () => manager.reconcile(product ? [product] : [], enabled ? [memberNames[0]] : []),
    action: (operation) =>
      manager.actionsFor(product).find((action) => action.operation === operation),
  };
}

test("only a matching active package gets one page-owned backend session", () => {
  const h = harness();
  h.sync();
  h.sync();
  assert.equal(h.sessions.length, 1);
  assert.equal(h.sessions[0].starts, 1);
  assert.equal(h.sessions[0].config.sourceName, memberNames[0]);
  assert.deepEqual(h.sessions[0].config.memberNames, { s101: memberNames[0], s57: memberNames[1] });
  assert.equal(h.action("pause").disabled, false);
  assert.equal(h.action("send").disabled, true);
  h.manager.destroy();
  assert.equal(h.sessions[0].destroyed, 1);
});

test("missing active-package proof and contradictory member names fail closed", () => {
  const inactive = harness({ active: false });
  inactive.sync();
  assert.equal(inactive.sessions.length, 0);
  assert.ok(inactive.manager.actionsFor(inactive.product).every((action) => action.disabled));
  const invalid = packageProduct({ memberName: "unrelated dataset" });
  assert.equal(resolvePackageIdentity(invalid), null);
  assert.equal(resolvePackageIdentity({ ...invalid, members: [] }), null);
  inactive.manager.destroy();
});

test("Discard cancellation and changed backend eligibility cannot dispatch", async () => {
  const h = harness();
  h.sync();
  const cancel = h.action("discard").onClick({});
  h.resolveConfirm(false);
  assert.equal(await cancel, false);
  assert.deepEqual(h.sessions[0].invokes, []);
  const revoked = h.action("discard").onClick({});
  h.projection.actionEligibility.discard = false;
  h.resolveConfirm(true);
  assert.equal(await revoked, false);
  assert.deepEqual(h.sessions[0].invokes, []);
  h.manager.destroy();
});

test("Discard confirmation cannot outlive a replacement Product or page", async () => {
  const h = harness();
  h.sync();
  const confirm = h.action("discard").onClick({});
  h.setProduct(packageProduct());
  h.sync();
  h.resolveConfirm(true);
  assert.equal(await confirm, false);
  assert.deepEqual(h.sessions[0].invokes, []);
  assert.equal(h.sessions[0].destroyed, 1);
  const second = h.action("discard").onClick({});
  h.manager.destroy();
  h.resolveConfirm(true);
  assert.equal(await second, false);
  assert.deepEqual(h.sessions[1].invokes, []);
});

test("successful Package mutations refresh only that Analyze Product", async () => {
  const h = harness();
  h.sync();
  assert.equal(await h.action("pause").onClick({}), true);
  assert.deepEqual(h.sessions[0].invokes, ["pause"]);
  assert.deepEqual(h.refreshes, [memberNames[0]]);
  const confirmed = h.action("discard").onClick({});
  h.resolveConfirm(true);
  assert.equal(await confirmed, true);
  assert.deepEqual(h.sessions[0].invokes, ["pause", "discard"]);
  assert.deepEqual(h.refreshes, [memberNames[0], memberNames[0]]);
  h.manager.destroy();
});

test("Send/Accept reflects backend and demo projection and never invents permission", async () => {
  const h = harness();
  h.sync();
  assert.equal(h.action("send").disabled, true);
  h.projection.actionEligibility.send = true;
  assert.equal(await h.action("send").onClick({}), true);
  assert.deepEqual(h.sessions[0].invokes, ["send"]);
  h.projection.primaryAction = "accept";
  h.projection.actionEligibility.accept = true;
  const action = h.action("accept");
  assert.equal(action.label, "Accept");
  assert.equal(await action.onClick({}), true);
  assert.deepEqual(h.sessions[0].invokes, ["send", "accept"]);
  h.manager.destroy();
});

test("disabling and removing a package dispose its session", () => {
  const h = harness();
  h.sync();
  h.setEnabled(false);
  h.sync();
  assert.equal(h.sessions[0].destroyed, 1);
  h.setEnabled(true);
  h.sync();
  assert.equal(h.sessions.length, 2);
  h.setProduct(null);
  h.manager.reconcile([], []);
  assert.equal(h.sessions[1].destroyed, 1);
  h.manager.destroy();
});

test("Analyze popup actions require the current registered graphic, layer and enabled Product", async () => {
  let product = packageProduct();
  const context = createWorkspaceProductContext({
    sourceId: "s101",
    datasetName: memberNames[0],
    productKey: memberNames[0],
    productType: "electronic-product",
    capabilities: { analyze: true },
    workUnit: product.workUnit,
    data: { attributes: product.productContext.data.attributes },
  });
  product = { ...product, productContext: context };
  const layer = {
    visible: true,
    appAnalyzeWorkUnitKey: product.workUnit.identityKey,
    graphics: [],
  };
  const graphic = {
    layer,
    visible: true,
    attributes: createProductContextIdentityAttributes(context),
  };
  layer.graphics.push(graphic);
  assert.equal(registerGraphicProductContext(graphic, context), true);
  let enabled = true;
  let layerCurrent = true;
  const invokes = [];
  const eligibility = { pause: true, discard: true, send: false };
  const controller = createAnalyzePackageActions({
    getProducts: () => [product],
    getProduct: (key) => (key === product.workUnit.identityKey ? product : null),
    isEnabled: () => enabled,
    isCurrentGraphicLayer: () => layerCurrent,
    refreshProduct: async () => true,
    createSession: () => ({
      start: async () => {},
      projection: () => ({
        verified: true,
        liveVerified: true,
        identityKey: context.identityKey,
        paused: false,
        primaryAction: "send",
        actionEligibility: eligibility,
      }),
      invoke: async (operation) => {
        invokes.push(operation);
        return true;
      },
      destroy() {},
    }),
  });
  controller.reconcile([product], [memberNames[0]]);
  const actions = controller.actionsForGraphic(graphic);
  assert.deepEqual(
    actions.map((action) => action.operation),
    ["pause", "discard", "send"]
  );
  assert.equal(actions[0].disabled, false);
  assert.equal(actions[2].disabled, true);
  assert.equal(
    actions.every((action) => action.isCurrent()),
    true
  );
  const anchor = { isConnected: true };
  assert.equal(await actions[0].onClick({ anchorElement: anchor }), true);
  assert.deepEqual(invokes, ["pause"]);
  anchor.isConnected = false;
  assert.equal(await actions[0].onClick({ anchorElement: anchor }), false);
  assert.deepEqual(invokes, ["pause"]);
  enabled = false;
  assert.equal(controller.actionsForGraphic(graphic).length, 0);
  enabled = true;
  layerCurrent = false;
  assert.equal(controller.actionsForGraphic(graphic).length, 0);
  layerCurrent = true;
  graphic.attributes = { ...graphic.attributes, productIdentityKey: "other-product" };
  assert.equal(controller.actionsForGraphic(graphic).length, 0);
  controller.destroy();
});

test("Analyze popup subscription notifies on projection change and ignores disposed sessions", () => {
  const h = harness();
  let observed = 0;
  const unsubscribe = h.manager.subscribe(() => {
    observed++;
  });
  h.sync();
  assert.equal(observed, 1);
  h.sessions[0].config.onChange();
  assert.equal(observed, 2);
  unsubscribe();
  h.sessions[0].config.onChange();
  assert.equal(observed, 2);
  h.manager.destroy();
});

test("Discard cannot dispatch after its Analyze popup closes during confirmation", async () => {
  const h = harness();
  h.sync();
  const anchor = { isConnected: true };
  const pending = h.action("discard").onClick({ anchorElement: anchor });
  anchor.isConnected = false;
  h.resolveConfirm(true);
  assert.equal(await pending, false);
  assert.deepEqual(h.sessions[0].invokes, []);
  h.manager.destroy();
});

test("ordinary Analyze Product popup shows the same disabled workflows without a Package endpoint", () => {
  const context = createWorkspaceProductContext({
    sourceId: "standalone-test",
    productKey: "ORDINARY",
    datasetName: "ORDINARY",
    productType: "ordinary-product",
    capabilities: { analyze: true },
  });
  const product = {
    datasetName: "ORDINARY",
    workspaceLoadState: "loaded",
    productContext: context,
  };
  const layer = { visible: true, appAnalyzeWorkUnitKey: null, graphics: [] };
  const graphic = { layer, attributes: createProductContextIdentityAttributes(context) };
  layer.graphics.push(graphic);
  assert.equal(registerGraphicProductContext(graphic, context), true);
  let requests = 0;
  const controller = createAnalyzePackageActions({
    getProducts: () => [product],
    isEnabled: () => true,
    isCurrentGraphicLayer: (candidate) => candidate === layer,
    createSession: () => {
      requests++;
      throw new Error("Standalone cannot use Package sessions");
    },
  });
  controller.reconcile([product], ["ORDINARY"]);
  const actions = controller.actionsForGraphic(graphic);
  assert.deepEqual(
    actions.map((action) => action.operation),
    ["pause", "discard", "send"]
  );
  assert.ok(actions.every((action) => action.disabled));
  assert.equal(requests, 0);
  controller.destroy();
});
