const GLOBAL_HELP_RULES = [
  {
    selector: "[data-nav-home-link]",
    title: "Open the main Product Manager map.",
    mode: "replace-generic",
  },
  {
    selector: "[data-nav-dashboard-link]",
    title: "Open the operational activity dashboard.",
    mode: "replace-generic",
  },
  {
    selector: "[data-nav-analyze-link]",
    title: "Open Analyze to inspect selected products and reports.",
    mode: "replace-generic",
  },
  {
    selector: "[data-nav-review-link]",
    title: "Open Review to compare multiple products side by side.",
    mode: "replace-generic",
  },
  {
    selector: "#display-scale-toggle, #display-scale-toggle-wrapper",
    title:
      "Toggle scale hiding. When enabled, products outside their display scale range are hidden.",
    mode: "replace-generic",
  },
  {
    selector: "#filter-button",
    title: "Open product filters for display scale, status and usage band.",
    mode: "replace-generic",
  },
  {
    selector: "#refresh-button",
    title: "Refresh product data from the API.",
    mode: "replace-generic",
  },
  {
    selector: "#theme-toggle",
    title: "Switch between light and dark mode.",
    mode: "fill-empty",
  },
  {
    selector: "#notification-button",
    title: "Open notifications and recent system messages.",
    mode: "replace-generic",
  },
  {
    selector: "#documentation-button",
    title: "Open product manager help and documentation.",
    mode: "replace-generic",
  },
  {
    selector: "#preferences-button, #settings-button, [data-preferences-button]",
    title: "Open preferences and reset saved frontend state.",
    mode: "replace-generic",
  },
  {
    selector: ".main-map-product-search__input",
    title: "Search for a product and open it on the map.",
    mode: "replace-generic",
  },
  {
    selector: ".main-map-product-search__option",
    title: (element) => element.title || `Open ${getElementText(element)} on the map.`,
    mode: "fill-empty",
  },
  {
    selector: ".pm-product-picker__input",
    title: "Search existing products or type a product name.",
    mode: "replace-generic",
  },
  {
    selector: ".pm-product-picker__button",
    title: "Add the selected or typed product.",
    mode: "replace-generic",
  },
  {
    selector: ".pm-product-picker__option",
    title: (element) => element.title || `Add ${getElementText(element)}.`,
    mode: "fill-empty",
  },
  {
    selector: "[data-clear-all-filters], .pm-filter-clear-all",
    title: "Clear all active product filters.",
    mode: "replace-generic",
  },
  {
    selector: ".pm-filter-select-all, [data-filter-select-all]",
    title: "Select all values for this filter.",
    mode: "replace-generic",
  },
  {
    selector: ".pm-filter-clear, [data-filter-clear]",
    title: "Clear this filter selection.",
    mode: "replace-generic",
  },
  {
    selector: ".pm-filter-reset, [data-filter-reset]",
    title: "Reset this filter to its default range.",
    mode: "replace-generic",
  },
  {
    selector: "calcite-slider[data-filter-range]",
    title: "Limit visible products by this display scale range.",
    mode: "fill-empty",
  },
  {
    selector: ".pm-dashboard-refresh-button",
    title: "Reload dashboard activity for the selected range.",
    mode: "replace-generic",
  },
  {
    selector: ".pm-dashboard-range-apply",
    title: "Apply the selected dashboard date range.",
    mode: "replace-generic",
  },
  {
    selector: ".pm-dashboard-range-action",
    title: (element) =>
      element.title || `Fill the dashboard range with ${getElementText(element)}.`,
    mode: "fill-empty",
  },
  {
    selector: ".pm-dashboard-range-date-button",
    title: (element) => `${getAriaLabel(element) || "Range date"}. Open the date picker.`,
    mode: "replace-generic",
  },
  {
    selector: ".pm-dashboard-range-date-clear",
    title: "Clear the To date and keep the range open-ended.",
    mode: "replace-generic",
  },
  {
    selector: ".pm-dashboard-date-picker__nav",
    title: (element) => getAriaLabel(element),
    mode: "fill-empty",
  },
  {
    selector: ".pm-dashboard-date-picker__day",
    title: (element) => `Select ${element.dataset.dateValue || getElementText(element)}.`,
    mode: "replace-generic",
  },
  {
    selector: ".pm-dashboard-summary-row, .pm-dashboard-summary-panel__row",
    title: "Filter the dashboard activity list by this summary value.",
    mode: "fill-empty",
  },

  {
    selector: ".pm-dashboard-link-button",
    title: (element) => createDashboardLinkHelp(element),
    mode: "replace-generic",
  },
  {
    selector: ".analyze-products__action-button",
    title: (element) => createAnalyzeCollapseActionHelp(element),
    mode: "replace-generic",
  },
  {
    selector: ".pm-dashboard-history-panel__close",
    title: "Close product history.",
    mode: "replace-generic",
  },
  {
    selector: ".popup-action-bar__action, [data-action-id]",
    title: (element) => createPopupActionHelp(element),
    mode: "replace-generic",
  },
  {
    selector: ".product-collection-tray button, .product-collection-tray [role='button']",
    title: (element) =>
      element.title || createActionTextHelp(element, "Use this Product Collection action."),
    mode: "fill-empty",
  },
  {
    selector: ".pm-history-event__toggle, .product-history-event__toggle",
    title: "Expand or collapse this history entry.",
    mode: "fill-empty",
  },
  {
    selector:
      "button[aria-label], a[aria-label], input[aria-label], select[aria-label], calcite-action[aria-label]",
    title: (element) => getAriaLabel(element),
    mode: "fill-empty",
  },
];

let helpTooltipsInitialized = false;
let helpTooltipObserver = null;
let pendingApply = false;

export function initGlobalHelpTooltips() {
  if (helpTooltipsInitialized) {
    return;
  }

  helpTooltipsInitialized = true;

  const start = () => {
    applyGlobalHelpTooltips();
    observeTooltipTargets();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
    return;
  }

  start();
}

export function applyGlobalHelpTooltips(root = document) {
  for (const rule of GLOBAL_HELP_RULES) {
    applyHelpRule(root, rule);
  }
}

function observeTooltipTargets() {
  if (helpTooltipObserver || !document.documentElement) {
    return;
  }

  helpTooltipObserver = new MutationObserver(() => {
    scheduleTooltipApply();
  });

  helpTooltipObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function scheduleTooltipApply() {
  if (pendingApply) {
    return;
  }

  pendingApply = true;

  window.requestAnimationFrame(() => {
    pendingApply = false;
    applyGlobalHelpTooltips();
  });
}

function applyHelpRule(root, rule) {
  if (!root?.querySelectorAll) {
    return;
  }

  root.querySelectorAll(rule.selector).forEach((element) => {
    const title = resolveTitle(rule.title, element);

    if (!title || !shouldSetTitle(element, title, rule.mode)) {
      return;
    }

    setHelpTitle(element, title);
  });
}

function resolveTitle(titleOrFactory, element) {
  const title = typeof titleOrFactory === "function" ? titleOrFactory(element) : titleOrFactory;

  return normalizeText(title);
}

function shouldSetTitle(element, nextTitle, mode) {
  const currentTitle = normalizeText(element.getAttribute("title"));

  if (!currentTitle) {
    return true;
  }

  if (currentTitle === nextTitle) {
    return false;
  }

  if (mode === "replace") {
    return true;
  }

  if (mode === "replace-generic") {
    return isGenericTooltip(element, currentTitle);
  }

  return false;
}

function setHelpTitle(element, title) {
  element.setAttribute("title", title);

  // Preserve explicit accessible names, but add one for icon-only controls that only had visual text.
  if (!element.hasAttribute("aria-label") && isIconOnlyControl(element)) {
    element.setAttribute("aria-label", title);
  }
}

function isGenericTooltip(element, title) {
  const text = getElementText(element);
  const ariaLabel = getAriaLabel(element);
  const label = normalizeText(element.getAttribute("label"));
  const calciteText = normalizeText(element.getAttribute("text"));

  return [text, ariaLabel, label, calciteText].some((value) => value && value === title);
}

function isIconOnlyControl(element) {
  return (
    element.tagName.toLowerCase() === "calcite-action" ||
    (element instanceof HTMLButtonElement && !getElementText(element))
  );
}

function createDashboardLinkHelp(element) {
  const text = getElementText(element);

  const dashboardLinkHelp = {
    Review: "Open this product in Product Review.",
    Analyze: "Open this product in Analyze.",
    History: "Open product history in the Dashboard side panel.",
    "IC-ENC": "Open the IC-ENC report when report links are available.",
    Validation: "Open the internal validation report when report links are available.",
  };

  return (
    dashboardLinkHelp[text] || createActionTextHelp(element, "Use this dashboard activity action.")
  );
}

function createAnalyzeCollapseActionHelp(element) {
  const text = getElementText(element);

  if (text === "Open all") {
    return "Open all product sections on this Analyze page.";
  }

  if (text === "Collapse all") {
    return "Collapse all product sections on this Analyze page.";
  }

  return createActionTextHelp(element, "Use this Analyze action.");
}

function createPopupActionHelp(element) {
  const actionId = element.dataset.actionId ?? element.getAttribute("data-action-id") ?? "";

  const actionHelp = {
    "freeze-feature": "Freeze this product so it waits for manual handling.",
    "unfreeze-feature": "Unfreeze this product so it can continue in the workflow.",
    "send-immediately": "Send this product to IC-ENC immediately.",
    export: "Open export options for this product.",
    "export-all": "Export actions for all product formats. Currently unavailable.",
    "export-all-edition": "All Edition export is currently disabled.",
    "export-all-update": "All Update export is currently disabled.",
    "export-s57": "S-57 export actions. Currently unavailable.",
    "s57-export-edition": "S-57 Edition export is currently disabled.",
    "s57-export-update": "S-57 Update export is currently disabled.",
    "export-s100": "Open S-100 export actions.",
    "s100-export-edition": "Export a new S-100 Edition for this product.",
    "s100-export-update": "S-100 Update export is currently disabled.",
    rollback: "Rollback this product by calling the rollback endpoint.",
    analyze: "Open this product in Analyze.",
    history: "Open product history.",
    tools: "Open additional product tools.",
  };

  return actionHelp[actionId] || createActionTextHelp(element, "Use this product action.");
}

function createActionTextHelp(element, fallback) {
  const text =
    getElementText(element) || getAriaLabel(element) || normalizeText(element.getAttribute("text"));

  return text ? `${text}.` : fallback;
}

function getElementText(element) {
  return normalizeText(element.textContent);
}

function getAriaLabel(element) {
  return normalizeText(element.getAttribute("aria-label"));
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}
