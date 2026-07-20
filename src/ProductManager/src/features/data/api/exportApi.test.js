import assert from "node:assert/strict";
import test from "node:test";

import { buildExportRequestPath } from "./exportApi.js";
import { EXPORT_TARGET } from "../domain/exportTarget.js";

test("S100 edition request path includes the readable export target", () => {
  assert.equal(
    buildExportRequestPath("101DK0040943E", "newedition", EXPORT_TARGET.S100),
    "export/101DK0040943E/newedition?exportTarget=S100"
  );
});

test("datasetName is URL encoded before the export request is sent", () => {
  assert.equal(
    buildExportRequestPath("101 DK/004?", "newedition", EXPORT_TARGET.S100),
    "export/101%20DK%2F004%3F/newedition?exportTarget=S100"
  );
});

test("rollback request path remains unchanged and has no export target", () => {
  assert.equal(
    buildExportRequestPath("101DK0040943E", "rollback"),
    "export/101DK0040943E/rollback"
  );
});
