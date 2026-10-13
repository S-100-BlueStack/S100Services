const ACTION_HELP = Object.freeze({
  "freeze-feature": "Freeze this product.",
  "unfreeze-feature": "Unfreeze this product.",
  "send-immediately": "Send this product to IC-ENC.",
  export: "Create an export for this product.",
  rollback: "Cancel the current export.",
  tools: "More actions.",
  analyze: "Open Analyze.",
  review: "Open Review.",
  history: "Open product history.",
});

/** Keep popup help short without weakening the separate action eligibility checks. */
export function getPopupActionHelpText(config) {
  if (config?.id?.startsWith("package-")) {
    return config.disabled ? config.disabledReason : config.helpText;
  }
  if (config?.disabled) {
    const reason = String(config.disabledReason ?? "");
    if (/wait until|still running|in progress|in use/i.test(reason)) {
      return "Wait for the current action to finish.";
    }
    if (/unfreeze/i.test(reason)) return "Unfreeze the product first.";
    if (/in transit/i.test(reason)) return "This product is already in transit.";
    if (config.id === "rollback") return "No export is available to cancel.";
    if (config.id === "send-immediately") return "This product cannot be sent right now.";
    if (config.id === "freeze-feature" || config.id === "unfreeze-feature") {
      return "This product cannot be changed right now.";
    }
    return "This action is not available right now.";
  }
  if (ACTION_HELP[config?.id]) return ACTION_HELP[config.id];
  if (
    config?.helpText &&
    !/\b(unavailable|disabled|not implemented|backend)\b/i.test(config.helpText)
  ) {
    return config.helpText;
  }
  return config?.label ? `${config.label.replace(/[.]+$/, "")}.` : "More information.";
}
