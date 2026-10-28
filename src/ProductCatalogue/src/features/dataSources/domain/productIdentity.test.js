import assert from "node:assert/strict";
import test from "node:test";

import {
  assertUniqueProductIdentities,
  createSourceAwareProductIdentity,
  resolveStableProductKey,
  serializeProductIdentity,
} from "./productIdentity.js";

test("stable product key resolves case-insensitive attributes without using array position", () => {
  assert.equal(resolveStableProductKey({ properties: { DatasetName: "101DK001" } }), "101DK001");
  assert.equal(resolveStableProductKey({ properties: { object_id: 42 } }), "42");
  assert.equal(resolveStableProductKey({ id: "feature-7" }), "feature-7");
});

test("missing stable identity fails with source and feature context", () => {
  assert.throws(
    () =>
      resolveStableProductKey(
        { properties: { status: "Ready" } },
        { fields: ["datasetName"], allowFeatureId: true },
        { sourceId: "s102", sourceLabel: "S-102", featureIndex: 3 }
      ),
    /Data source "S-102" \(s102\) feature at index 3 is missing a stable product identity/
  );
});

test("same product key remains distinct across sources", () => {
  const paperIdentity = serializeProductIdentity(
    createSourceAwareProductIdentity("paper-charts", "P001")
  );
  const s102Identity = serializeProductIdentity(createSourceAwareProductIdentity("s102", "P001"));

  assert.notEqual(paperIdentity, s102Identity);
});

test("duplicate identity inside one source is rejected deterministically", () => {
  assert.throws(
    () =>
      assertUniqueProductIdentities(
        [
          { sourceId: "s102", productKey: "P001" },
          { sourceId: "s102", productKey: "P001" },
        ],
        { sourceId: "s102", sourceLabel: "S-102" }
      ),
    /duplicate product identity \["s102","P001"\]/
  );
});
