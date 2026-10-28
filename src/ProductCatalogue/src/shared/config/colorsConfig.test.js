import assert from "node:assert/strict";
import test from "node:test";

import { statusColorConfig } from "./colorsConfig.js";

const EXPECTED_STATUS_RGB = Object.freeze({
  1: "115,125,120",
  2: "55,150,85",
  5: "115,120,190",
  6: "55,120,195",
  7: "205,55,55",
  8: "205,140,30",
  9: "55,135,210",
  10: "125,95,190",
  11: "40,155,130",
  12: "45,145,80",
  13: "95,125,105",
  14: "130,130,130",
  15: "220,45,45",
});

test("status palette covers the current ProductStatus IDs without retired gaps", () => {
  assert.deepEqual(
    Object.keys(statusColorConfig).map(Number),
    Object.keys(EXPECTED_STATUS_RGB).map(Number)
  );
});

test("status palette preserves the shared fill, outline and header alpha contract", () => {
  for (const [id, rgb] of Object.entries(EXPECTED_STATUS_RGB)) {
    assert.deepEqual(statusColorConfig[id], {
      fill: `rgba(${rgb},0.35)`,
      outline: `rgba(${rgb},0.9)`,
      header: `rgba(${rgb},0.25)`,
    });
  }
});
