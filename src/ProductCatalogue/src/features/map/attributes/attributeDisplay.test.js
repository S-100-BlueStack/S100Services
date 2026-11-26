import assert from "node:assert/strict";
import test from "node:test";
import { loadStatuses } from "../../data/stores/statusStore.js";
import {
  formatElectronicProductStatus,
  formatStatusDisplayValue,
  resolveElectronicProductDisplayStatus,
} from "./attributeDisplay.js";

test("electronic display recognizes authoritative IDs and names while generic sources keep their text", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json([
      { Id: 5, Name: "Hold" },
      { Id: 6, Name: "In Transit" },
      { Id: 15, Name: "Error" },
    ])
  );
  await loadStatuses();
  assert.equal(formatElectronicProductStatus(5), "Hold");
  assert.equal(formatElectronicProductStatus(" 6 "), "In Transit");
  assert.equal(resolveElectronicProductDisplayStatus("Error"), 15);
  assert.equal(formatElectronicProductStatus("11"), "11");
  for (const value of [null, undefined, " ", 99, "99", true, [5], "Mock ready"]) {
    assert.equal(formatElectronicProductStatus(value), "Unknown");
  }
  assert.equal(formatStatusDisplayValue("Mock ready"), "Mock ready");
});
