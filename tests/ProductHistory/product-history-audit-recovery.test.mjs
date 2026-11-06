import assert from "node:assert/strict";
import test from "node:test";
import { associateProductHistoryEvents } from "../../src/ProductCatalogue/src/features/timeline/model/productHistoryAuditEvents.js";

const legacy = { sourceKind: "legacy", stateRecordId: "exact-state", type: "export" };
const explicit = {
  sourceKind: "explicit", stateRecordId: "exact-state", rawEventType: "Export",
  type: "export", outcome: "Succeeded",
};

for (const outcome of ["Succeeded", "SucceededWithWarning"]) {
  test(`exact Export/${outcome} associates one inferred Export`, () => {
    assert.deepEqual(associateProductHistoryEvents([legacy], [{ ...explicit, outcome }]), [{ ...explicit, outcome }]);
  });
}
for (const outcome of ["Failed", "RequiresManualReview", "FutureOutcome"]) {
  test(`${outcome} never hides the legacy Export`, () => {
    assert.equal(associateProductHistoryEvents([legacy], [{ ...explicit, outcome }]).length, 2);
  });
}
for (const type of ["status", "freeze", "unfreeze", "note", "rollback", "send"]) {
  test(`successful Export does not hide a ${type} completion row`, () => {
    assert.equal(associateProductHistoryEvents([{ ...legacy, type }], [explicit]).length, 2);
  });
}
test("duplicate state identities fail closed", () => {
  assert.equal(associateProductHistoryEvents([legacy, { ...legacy, type: "status" }], [explicit]).length, 3);
});
test("matching time and version do not substitute for the exact state identity", () => {
  const common = { timestamp: "2026-10-14T12:00:00Z", edition: 5, update: 0 };
  assert.equal(associateProductHistoryEvents([{ ...legacy, ...common }], [{ ...explicit, ...common, stateRecordId: "other-state" }]).length, 2);
});
test("Discard does not acquire Export or Rollback association semantics", () => {
  assert.equal(associateProductHistoryEvents([legacy], [{ ...explicit, rawEventType: "Discard" }]).length, 2);
});
