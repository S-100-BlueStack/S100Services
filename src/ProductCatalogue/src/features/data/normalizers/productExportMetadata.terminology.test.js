import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProductExportMetadata } from "./productExportMetadata.js";

test("S100 export metadata keeps its internal standard and exposes S-101 presentation", () => {
  const metadata = normalizeProductExportMetadata({
    type: "S100",
    datasetName: "101DK0040943E",
    edition: 3,
    update: 0,
  });

  assert.deepEqual(metadata.standards, ["S100"]);
  assert.equal(metadata.items[0].standard, "S100");
  assert.equal(metadata.items[0].type, "S100");
  assert.equal(metadata.items[0].label, "S-101");
});
