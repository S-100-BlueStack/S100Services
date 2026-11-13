const ACTION_HELP = Object.freeze({
  "freeze-feature": "Freeze product.",
  "unfreeze-feature": "Unfreeze product.",
  "send-immediately": "Send to IC-ENC.",
  export: "Export product.",
  rollback: "Cancel export.",
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
      return "Wait for current action.";
    }
    if (/unfreeze/i.test(reason)) return "Unfreeze product first.";
    if (/in transit/i.test(reason)) return "Product already in transit.";
    if (config.id === "rollback") return "No export to cancel.";
    if (config.id === "send-immediately") return "Sending is currently unavailable.";
    if (config.id === "freeze-feature" || config.id === "unfreeze-feature") {
      return "Action currently unavailable.";
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
