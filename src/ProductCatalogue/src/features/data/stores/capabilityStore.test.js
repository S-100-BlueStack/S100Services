import assert from "node:assert/strict";
import test from "node:test";

import {
  applyProductCatalogueCapabilities,
  getSendToIcEncCapability,
  normalizeSendToIcEncCapability,
} from "./capabilityStore.js";

test("simulation capability is enabled only for the explicit backend contract", () => {
  const capability = normalizeSendToIcEncCapability({
    mode: "Simulation",
    available: true,
  });

  assert.deepEqual(capability, {
    mode: "Simulation",
    available: true,
    reason: null,
  });
});

test("disabled capability preserves the backend-owned reason", () => {
  const capability = normalizeSendToIcEncCapability({
    mode: "Disabled",
    available: false,
    reason: "Send to IC-ENC is disabled.",
  });

  assert.deepEqual(capability, {
    mode: "Disabled",
    available: false,
    reason: "Send to IC-ENC is disabled.",
  });
});

test("missing unknown and reserved capability modes fail closed", () => {
  for (const value of [
    undefined,
    { mode: "Simulation", available: false },
    { mode: "Live", available: true },
    { mode: "Unknown", available: true },
  ]) {
    const capability = normalizeSendToIcEncCapability(value);
    assert.equal(capability.available, false);
    assert.ok(capability.reason);
  }
});

test("capability application updates the shared value used by popup guards", () => {
  applyProductCatalogueCapabilities({
    sendToIcEnc: {
      mode: "Simulation",
      available: true,
    },
  });

  assert.equal(getSendToIcEncCapability().mode, "Simulation");
  assert.equal(getSendToIcEncCapability().available, true);

  applyProductCatalogueCapabilities({
    sendToIcEnc: {
      mode: "Disabled",
      available: false,
      reason: "Send to IC-ENC is disabled.",
    },
  });
});
