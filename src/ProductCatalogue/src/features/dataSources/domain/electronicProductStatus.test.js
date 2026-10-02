import assert from "node:assert/strict";
import test from "node:test";
import { normalizeElectronicProductStatus } from "./electronicProductStatus.js";
import { statusColorConfig } from "../../../shared/config/colorsConfig.js";

// Contract captured from ProductState and ResponseTypes.ProductStatus at 5fedc0f0.
const wireContract = [
  ["Idle", 1, 1],
  ["Exported", 2, 2],
  ["Frozen", 5, 5],
  ["InTransit", 6, 6],
  ["Rejected", 7, 7],
  ["ChangesDetected", 8, 8],
  ["Exporting", 9, 9],
  ["Validating", 10, 10],
  ["ReadyForDistribution", 11, 11],
  ["AcceptedForDistribution", 12, 12],
  ["Published", 13, 13],
  ["Cancelled", 14, 14],
  ["Error", 15, 15],
];

for (const [name, wireId, logicalId] of wireContract) {
  test(`${name} numeric wire state maps to the ProductStatus palette`, () => {
    assert.equal(normalizeElectronicProductStatus(wireId), logicalId);
    assert.equal(normalizeElectronicProductStatus(String(wireId)), logicalId);
    assert.ok(statusColorConfig[logicalId]);
  });
}

test("unknown and missing wire states never fabricate a known status", () => {
  for (const value of [
    undefined,
    null,
    "",
    " ",
    true,
    false,
    {},
    [],
    0,
    3,
    4,
    16,
    "Ready",
    NaN,
    Infinity,
  ]) {
    assert.equal(normalizeElectronicProductStatus(value), undefined);
  }
});
