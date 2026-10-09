import assert from "node:assert/strict";
import test from "node:test";
import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { resolveProductContext } from "../../products/domain/productContext.js";
import { createPackagePopupPresentation } from "./packagePopupPresentation.js";
import { createPopupActionGroups } from "./popupActionConfig.js";
import { createActionConfigSignature } from "./popupActionConfigSignature.js";

function selection() {
  const source = createDataSourceRegistry().byId.get("s101");
  const graphic = {
    attributes: {
      sourceId: source.id,
      productKey: "PRIMARY",
      productIdentityKey: JSON.stringify([source.id, "PRIMARY"]),
      productType: source.productType,
      datasetName: "PRIMARY",
      workUnitMetadata: {
        members: { s101: { datasetName: "PRIMARY" }, s57: { datasetName: "SECONDARY" } },
      },
      workUnitStatus: { workflowStatus: 11, members: [{ key: "s101", status: 11 }] },
    },
    layer: {
      appSourceDefinition: source,
      appSourceId: source.id,
      appProductType: source.productType,
      customId: source.layerDefinitions[0].id,
    },
  };
  graphic.layer.graphics = [graphic];
  return {
    graphic,
    attributes: graphic.attributes,
    productContext: resolveProductContext({ graphic }),
  };
}

function projection(context, overrides = {}) {
  return {
    verified: true,
    identityKey: context.identityKey,
    paused: false,
    primaryAction: "send",
    eligibleMembers: [{ key: "s101", datasetName: "PRIMARY" }],
    actionEligibility: { pause: true, resume: false, send: true, accept: false, discard: true },
    ...overrides,
  };
}

test("registry package exposes isolated disabled controls and unchanged Tools navigation", () => {
  const options = selection();
  const actions = createPopupActionGroups(options).flat();
  assert.deepEqual(
    actions.map((action) => action.id),
    ["package-pause-resume", "package-discard-export", "package-send-accept", "tools"]
  );
  assert.deepEqual(
    actions.at(-1).items.map((item) => item.id),
    ["analyze", "review", "history"]
  );
  for (const action of actions.slice(0, -1)) {
    assert.equal(action.disabled, true);
    assert.equal(action.onClick, undefined);
    assert.deepEqual(action.availability, {
      frontendSupported: true,
      backendAuthorized: null,
      dispatchImplemented: false,
    });
  }
  assert.equal(createPopupActionGroups(options).length, 1);
  const model = createPackagePopupPresentation(options);
  assert.equal(model.actions.length, 3);
  assert.equal(
    model.actions.every((action) => action.textEnabled === false),
    true
  );
  assert.equal(
    model.actions.every((action) => action.ariaLabel === action.label),
    true
  );
  assert.equal(model.actions[1].label, "Discard");
  assert.equal(
    model.actions.some((action) => action.label === "Accept"),
    false
  );
  assert.equal(model.actions[0].label, "Pause");
  assert.match(model.actions[0].helpText, /Actual Pause state is unavailable/);
  assert.equal(model.actions[2].label, "Send");
  assert.equal(model.summary.pausedText, null);
  assert.equal(model.summary.scheduledSendAt, null);
  assert.match(model.explanation, /not yet connected/);
});

test("presentation fixtures support Resume, exact eligible Send counts and Accept without dispatch", () => {
  const options = selection();
  const first = createPackagePopupPresentation({
    ...options,
    workflowPresentation: projection(options.productContext),
  });
  assert.equal(first.actions[2].label, "Send (1)");
  assert.match(first.actions[2].helpText, /PRIMARY/);
  assert.doesNotMatch(first.actions[2].helpText, /SECONDARY/);
  const paused = createPackagePopupPresentation({
    ...options,
    workflowPresentation: projection(options.productContext, {
      paused: true,
      scheduledSendAt: "2026-10-09T10:00:00Z",
      eligibleMembers: [
        { key: "s101", datasetName: "PRIMARY" },
        { key: "s57", datasetName: "SECONDARY" },
      ],
      dispatchImplemented: true,
    }),
  });
  assert.equal(paused.actions[0].label, "Resume");
  assert.equal(paused.actions[0].id, first.actions[0].id);
  assert.equal(paused.actions[2].label, "Send (2)");
  assert.equal(paused.summary.scheduledSendAt, "2026-10-09T10:00:00Z");
  assert.match(paused.summary.pausedText, /internal processing may continue/);
  assert.notEqual(
    createActionConfigSignature(paused.actions[0]),
    createActionConfigSignature(first.actions[0])
  );
  const accept = createPackagePopupPresentation({
    ...options,
    workflowPresentation: projection(options.productContext, {
      primaryAction: "accept",
      actionEligibility: { accept: true },
      outcomeText: "S-101 will be committed; the failed S-57 candidate will not be committed.",
    }),
  });
  assert.match(accept.actions[2].helpText, /does not approve a failed product/);
  assert.equal(accept.actions[2].id, first.actions[2].id);
  assert.equal(accept.actions[2].label, "Accept");
  assert.equal(accept.actions[2].icon, "check");
  assert.equal(accept.actions.length, 3);
  assert.equal(
    accept.actions.some((action) => action.operation === "send"),
    false
  );
  assert.match(accept.summary.outcomeText, /will not be committed/);
  for (const model of [first, paused, accept]) {
    assert.equal(
      model.actions.every((action) => action.disabled && !action.onClick && !action.loading),
      true
    );
    assert.equal(
      model.actions.every((action) => action.availability.dispatchImplemented === false),
      true
    );
  }
});

test("untrusted Graphic fields and Product state never become workflow authorization or Send count", () => {
  const options = selection();
  for (const status of [1, 2, 5, 11, 15]) {
    const attributes = {
      ...options.attributes,
      status,
      paused: true,
      scheduledSendAt: "2026-10-09T10:00:00Z",
      workflowPresentation: projection(options.productContext),
      packageActions: { send: true, accept: true, dispatchImplemented: true },
      primaryAction: "accept",
      icEncResponse: { approved: true, acknowledgementRequired: true },
      exportMetadata: {
        items: [
          { type: "S100", status: 11 },
          { type: "S57", status: 11 },
        ],
      },
    };
    const model = createPackagePopupPresentation({ ...options, attributes });
    assert.equal(model.actions[2].label, "Send");
    assert.equal(model.summary.scheduledSendAt, null);
    assert.equal(model.summary.pausedText, null);
    assert.equal(
      model.actions.every((action) => action.onClick === undefined),
      true
    );
    assert.equal(createPopupActionGroups({ ...options, attributes }).flat().length, 4);
  }
});

test("unknown, mismatched and contradictory presentation fixtures fail closed", () => {
  const options = selection();
  for (const input of [
    {},
    { verified: "true" },
    { identityKey: "foreign" },
    { paused: "false" },
    { primaryAction: "unknown" },
    { eligibleMembers: [{ key: "s101", datasetName: "FOREIGN" }] },
    { eligibleMembers: [{ key: "foreign", datasetName: "SECRET" }] },
    {
      eligibleMembers: [
        { key: "s101", datasetName: "PRIMARY" },
        { key: "s101", datasetName: "PRIMARY" },
      ],
    },
  ]) {
    const fixture = Object.keys(input).length ? projection(options.productContext, input) : {};
    const model = createPackagePopupPresentation({ ...options, workflowPresentation: fixture });
    assert.equal(model.actions[2].label, "Send");
    assert.equal(
      model.actions.every((action) => action.disabled && !action.onClick),
      true
    );
    assert.doesNotMatch(JSON.stringify(model), /SECRET|FOREIGN/);
  }
  for (const time of [
    null,
    123,
    "tomorrow",
    "2026-10-09",
    "2026-10-09T10:00:00",
    "2026-13-09T10:00:00Z",
    "2026-02-30T10:00:00Z",
    "2026-10-09T24:00:00Z",
  ]) {
    const model = createPackagePopupPresentation({
      ...options,
      workflowPresentation: projection(options.productContext, { scheduledSendAt: time }),
    });
    assert.equal(model.summary.scheduledSendAt, null);
  }
});

test("invalid source/member identity and removed Graphics expose no package member data", () => {
  assert.equal(createPackagePopupPresentation(), null);
  const options = selection();
  assert.equal(createPackagePopupPresentation({ attributes: options.attributes }), null);
  assert.equal(createPackagePopupPresentation({ ...options, attributes: null }), null);
  assert.equal(
    createPackagePopupPresentation({
      ...options,
      attributes: { ...options.attributes, workUnitStatus: { members: {} } },
    }),
    null
  );
  assert.equal(
    createPackagePopupPresentation({
      ...options,
      attributes: { ...options.attributes, sourceId: "foreign" },
    }),
    null
  );
  for (const metadata of [
    { s101: { datasetName: "FOREIGN" } },
    { s57: { datasetName: "PRIMARY" } },
    { s101: { datasetName: "PRIMARY" }, s57: { datasetName: "PRIMARY" } },
  ]) {
    assert.equal(
      createPackagePopupPresentation({
        ...options,
        attributes: { ...options.attributes, workUnitMetadata: { members: metadata } },
      }),
      null
    );
  }
  options.graphic.layer.graphics = [];
  assert.equal(createPackagePopupPresentation(options), null);
  options.graphic.layer.graphics = [options.graphic];
  options.graphic.layer.visible = false;
  assert.equal(createPackagePopupPresentation(options), null);
  options.graphic.layer.visible = true;
  options.graphic.layer.appSourceDefinition = {
    ...options.graphic.layer.appSourceDefinition,
    workUnit: null,
  };
  assert.equal(createPackagePopupPresentation(options), null);
  assert.deepEqual(createPopupActionGroups(options), []);
});

test("known source-owned workflow status is text only and unknown status has no invented label", () => {
  const options = { ...selection(), workflowStatusLabels: { 11: "Ready for distribution" } };
  const model = createPackagePopupPresentation(options);
  assert.equal(model.summary.workflowText, "Package workflow: Ready for distribution");
  assert.equal(model.actions[2].label, "Send");
  for (const value of [999, "package-paused", {}, null, undefined]) {
    options.attributes.workUnitStatus.workflowStatus = value;
    assert.equal(
      createPackagePopupPresentation(options).summary.workflowText,
      "Package workflow status unavailable."
    );
  }
});

test("package presentation follows a declaration rather than source name or dataset prefix", () => {
  const options = selection();
  const source = {
    ...options.graphic.layer.appSourceDefinition,
    workUnit: structuredClone(options.graphic.layer.appSourceDefinition.workUnit),
  };
  source.id = "another-provider";
  source.workUnit.members[0].sourceId = source.id;
  options.graphic.layer.appSourceDefinition = source;
  options.graphic.layer.appSourceId = source.id;
  options.attributes.sourceId = source.id;
  options.attributes.productIdentityKey = JSON.stringify([source.id, "PRIMARY"]);
  options.productContext = resolveProductContext({ graphic: options.graphic });
  assert.equal(createPackagePopupPresentation(options).actions[0].label, "Pause");
  assert.equal(createPopupActionGroups(options).flat().at(-1).id, "tools");
});
