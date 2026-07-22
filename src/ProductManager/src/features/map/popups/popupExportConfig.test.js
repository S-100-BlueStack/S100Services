import assert from "node:assert/strict";
import test from "node:test";

import { POPUP_EXPORT_GROUPS } from "./popupExportConfig.js";
import { EXPORT_TARGET } from "../../data/domain/exportTarget.js";
import { EXPORT_TYPE, isSupportedExportAction } from "./popupExportContract.js";

function findExportGroup(id) {
  return POPUP_EXPORT_GROUPS.find((group) => group.id === id);
}

function findExportAction(groupId, actionId) {
  return findExportGroup(groupId)?.actions.find((action) => action.id === actionId);
}

function getAllExportActions() {
  return POPUP_EXPORT_GROUPS.flatMap((group) => group.actions);
}

test("all six export leaves have explicit target and export type metadata", () => {
  const actions = getAllExportActions();

  assert.equal(actions.length, 6);

  for (const action of actions) {
    assert.ok(Object.values(EXPORT_TARGET).includes(action.target));
    assert.ok(Object.values(EXPORT_TYPE).includes(action.exportType));
  }
});

test("each leaf target matches its export group scope", () => {
  for (const group of POPUP_EXPORT_GROUPS) {
    for (const action of group.actions) {
      assert.equal(action.target, group.scope);
    }
  }
});

test("All export leaf actions are disabled", () => {
  const allGroup = findExportGroup("export-all");

  assert.ok(allGroup);
  assert.equal(allGroup.label, "All");
  assert.equal(findExportAction("export-all", "export-all-edition")?.implemented, false);
  assert.equal(findExportAction("export-all", "export-all-update")?.implemented, false);
});

test("S100 edition export is the only implemented export action", () => {
  const implementedActions = getAllExportActions().filter((action) => action.implemented);
  const s100Edition = findExportAction("export-s100", "s100-export-edition");

  assert.deepEqual(implementedActions, [s100Edition]);
  assert.equal(s100Edition?.target, EXPORT_TARGET.S100);
  assert.equal(s100Edition?.exportType, EXPORT_TYPE.EDITION);
  assert.equal(typeof s100Edition?.request, "function");
  assert.equal(isSupportedExportAction(s100Edition), true);
});

test("all future export leaves remain disabled without request dispatch", () => {
  const disabledActions = getAllExportActions().filter((action) => !action.implemented);

  assert.equal(disabledActions.length, 5);

  for (const action of disabledActions) {
    assert.equal(action.request, null);
    assert.equal(isSupportedExportAction(action), false);
  }
});
