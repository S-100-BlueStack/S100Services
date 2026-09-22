import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAoi, normalizeAoiJobSummary } from "./aoiModel.js";

test("normalizeAoi uses the current test Feature Service fields", () => {
  const aoi = normalizeAoi({
    attributes: {
      OBJECTID: 42,
      PRODUCTNAME: "DK Test Product",
      SERIES: "DK",
      EDITION: 3,
      PRODUCTID: "{9BCE3666-D5D9-4D3D-A32B-0B6F3E9E46F7}",
      GlobalID: "{E8C7C857-6A9A-4A64-81E2-2B38E7B49F91}",
    },
    geometry: {
      type: "polygon",
    },
  });

  assert.equal(aoi.id, "{E8C7C857-6A9A-4A64-81E2-2B38E7B49F91}");
  assert.equal(aoi.name, "DK Test Product");
  assert.equal(aoi.objectId, "42");
  assert.equal(aoi.globalId, "{E8C7C857-6A9A-4A64-81E2-2B38E7B49F91}");
  assert.equal(aoi.productId, "{9BCE3666-D5D9-4D3D-A32B-0B6F3E9E46F7}");
  assert.equal(aoi.series, "DK");
  assert.equal(aoi.edition, 3);
  assert.deepEqual(aoi.geometry, {
    type: "polygon",
  });
});

test("normalizeAoi falls back to OBJECTID when stable identifiers are missing", () => {
  const aoi = normalizeAoi({
    attributes: {
      OBJECTID: 7,
    },
  });

  assert.equal(aoi.id, "aoi-7");
  assert.equal(aoi.name, "Unnamed Area of Interest");
});

test("normalizeAoiJobSummary keeps invalid counts safe for UI use", () => {
  assert.deepEqual(
    normalizeAoiJobSummary({
      total: "5",
      active: -1,
      highPriority: "not-a-number",
    }),
    {
      total: 5,
      active: 0,
      highPriority: 0,
    }
  );
});
