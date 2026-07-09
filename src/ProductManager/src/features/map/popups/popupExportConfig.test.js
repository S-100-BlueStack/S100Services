import assert from "node:assert/strict";
import test from "node:test";

import { POPUP_EXPORT_GROUPS } from "./popupExportConfig.js";

function findExportGroup(id) {
  return POPUP_EXPORT_GROUPS.find((group) => group.id === id);
}

function findExportAction(groupId, actionId) {
  return findExportGroup(groupId)?.actions.find((action) => action.id === actionId);
}

test("All export leaf actions are disabled", () => {
  const allGroup = findExportGroup("export-all");

  assert.ok(allGroup);
  assert.equal(allGroup.label, "All");
  assert.equal(findExportAction("export-all", "export-all-edition")?.implemented, false);
  assert.equal(findExportAction("export-all", "export-all-update")?.implemented, false);
});

test("S100 edition export is the only implemented S100 export action", () => {
  const s100Edition = findExportAction("export-s100", "s100-export-edition");
  const s100Update = findExportAction("export-s100", "s100-export-update");

  assert.equal(s100Edition?.implemented, true);
  assert.equal(typeof s100Edition?.request, "function");
  assert.equal(s100Update?.implemented, false);
  assert.equal(s100Update?.request, null);
});

test("S57 export leaf actions remain disabled", () => {
  assert.equal(findExportAction("export-s57", "s57-export-edition")?.implemented, false);
  assert.equal(findExportAction("export-s57", "s57-export-update")?.implemented, false);
});
