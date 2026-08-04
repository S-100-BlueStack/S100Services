import { fetchProductCatalogueCapabilities } from "../api/capabilityApi.js";

const UNAVAILABLE_REASON = "Send to IC-ENC availability could not be verified.";
const DISABLED_CAPABILITY = Object.freeze({
  mode: "Disabled",
  available: false,
  reason: UNAVAILABLE_REASON,
});

let sendToIcEncCapability = DISABLED_CAPABILITY;

export async function loadCapabilities() {
  try {
    const result = await fetchProductCatalogueCapabilities();
    return applyProductCatalogueCapabilities(result?.success ? result.data : null);
  } catch {
    return applyProductCatalogueCapabilities(null);
  }
}

export function applyProductCatalogueCapabilities(value) {
  sendToIcEncCapability = normalizeSendToIcEncCapability(value?.sendToIcEnc);

  return {
    sendToIcEnc: sendToIcEncCapability,
  };
}

export function getSendToIcEncCapability() {
  return sendToIcEncCapability;
}

export function normalizeSendToIcEncCapability(value) {
  const mode = normalizeText(value?.mode);
  const available = value?.available === true;
  const reason = normalizeText(value?.reason);

  if (mode === "Simulation" && available) {
    return Object.freeze({
      mode,
      available: true,
      reason: null,
    });
  }

  return Object.freeze({
    mode: mode || "Disabled",
    available: false,
    reason: reason || UNAVAILABLE_REASON,
  });
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
