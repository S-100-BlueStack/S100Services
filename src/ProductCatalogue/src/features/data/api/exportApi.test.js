import assert from "node:assert/strict";
import test from "node:test";

import { EXPORT_TARGET } from "../domain/exportTarget.js";
import { buildExportRequestPath } from "./exportApi.js";

test("S100 edition job path includes the readable export target", () => {
  assert.equal(
    buildExportRequestPath("101DK0040943E", "newedition", EXPORT_TARGET.S100),
    "export/101DK0040943E/newedition/jobs?exportTarget=S100"
  );
});

test("datasetName is URL encoded before the export job is started", () => {
  assert.equal(
    buildExportRequestPath("101 DK/004?", "newedition", EXPORT_TARGET.S100),
    "export/101%20DK%2F004%3F/newedition/jobs?exportTarget=S100"
  );
});

test("rollback uses the async job endpoint without an export target", () => {
  assert.equal(
    buildExportRequestPath("101DK0040943E", "rollback"),
    "export/101DK0040943E/rollback/jobs"
  );
});
