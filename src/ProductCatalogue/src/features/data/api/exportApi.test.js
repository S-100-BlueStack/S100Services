import assert from "node:assert/strict";
import test from "node:test";

import { buildExportRequestPath } from "./exportApi.js";

test("edition route lets the backend resolve the product specification", () => {
  assert.equal(
    buildExportRequestPath("101DK0040943E", "newedition"),
    "export/101DK0040943E/newedition"
  );
});

test("datasetName is URL encoded before the export job is started", () => {
  assert.equal(
    buildExportRequestPath("101 DK/004?", "newedition"),
    "export/101%20DK%2F004%3F/newedition"
  );
});

test("Cancel Export uses the current asynchronous route", () => {
  assert.equal(
    buildExportRequestPath("101DK0040943E", "cancel-export"),
    "export/101DK0040943E/cancel-export"
  );
});
