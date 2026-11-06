/**
 * Shared popup action presentation for any source-aware Product.
 * This module describes controls; it never grants backend mutation permission.
 * Existing package action IDs are retained for stable reconciliation/onboarding.
 */
export function createPopupWorkflowActions({
  paused = false,
  primaryAction = "send",
  eligibleMembers = null,
  actionEligibility = null,
  subject = "product",
} = {}) {
  const pauseOperation = paused ? "resume" : "pause";
  const primaryOperation = primaryAction === "accept" ? "accept" : "send";
  const primaryLabel =
    primaryOperation === "accept"
      ? "Accept"
      : eligibleMembers?.length
        ? `Send (${eligibleMembers.length})`
        : "Send";
  const isPackage = subject === "package";
  const action = (id, operation, label, icon, helpText) => ({
    id,
    operation,
    label,
    icon,
    helpText,
    ariaLabel: label,
    controlKind: "unavailable-package",
    textEnabled: false,
    disabled: true,
    disabledReason: `Unable to ${operation} this ${subject} right now.`,
    loading: false,
    availability: {
      frontendSupported: true,
      backendAuthorized:
        typeof actionEligibility?.[operation] === "boolean" ? actionEligibility[operation] : null,
      dispatchImplemented: false,
    },
    className: "popup-action-bar__action--workflow",
  });

  return [
    action(
      "package-pause-resume",
      pauseOperation,
      paused ? "Resume" : "Pause",
      paused ? "play" : "pause",
      paused ? `Resume delivery for this ${subject}.` : `Pause delivery for this ${subject}.`
    ),
    action(
      "package-discard-export",
      "discard",
      "Discard",
      "x-circle",
      isPackage
        ? "Discard the S-101 and S-57 package. This cannot be undone."
        : "Discard this product's active candidate. This cannot be undone."
    ),
    action(
      "package-send-accept",
      primaryOperation,
      primaryLabel,
      primaryOperation === "accept" ? "check" : "send",
      primaryOperation === "accept"
        ? `Accept the ${subject} results.`
        : `Send the ${subject} to IC-ENC.`
    ),
  ];
}
