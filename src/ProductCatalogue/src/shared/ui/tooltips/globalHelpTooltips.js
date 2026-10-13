import { bindHelpTooltip, normalizeHelpText } from "./helpTooltip.js";

const GLOBAL_HELP_RULES = [
  {
    selector: "[data-nav-home-link]",
    title: "Open the map",
    mode: "replace-generic",
  },
  {
    selector: "[data-nav-dashboard-link]",
    title: "Open Dashboard",
    mode: "replace-generic",
  },
  {
    selector: "[data-nav-analyze-link]",
    title: "Open Analyze",
    mode: "replace-generic",
  },
  {
    selector: "[data-nav-review-link]",
    title: "Open Review",
    mode: "replace-generic",
  },
  {
    selector: "#filter-button",
    title: "Filter products",
    mode: "replace-generic",
  },
  {
    selector: "#data-sources-button",
    title: "Choose data sources",
    mode: "replace-generic",
  },
  {
    selector: "#refresh-button",
    title: "Refresh products",
    mode: "replace-generic",
  },
  {
    selector: "#notification-button",
    title: "View notifications",
    mode: "replace-generic",
  },
  {
    selector: "#documentation-button",
    title: "Open help",
    mode: "replace-generic",
  },
  {
    selector: "#preferences-button, #settings-button, [data-preferences-button]",
    title: "Open preferences",
    mode: "replace-generic",
  },
  {
    selector: ".main-map-product-search__input",
    title: "Find a product on the map",
    mode: "replace-generic",
  },
  {
    selector: "#main-map-locator-button",
    title: "Find a place on the map",
    mode: "replace-generic",
  },
  {
    selector: ".main-map-product-search__option",
    title: (element) => getAuthoredTitle(element) || `Open ${getElementText(element)} on the map`,
    mode: "fill-empty",
  },
  {
    selector: ".pc-product-picker__input",
    title: "Find or enter a product",
    mode: "replace-generic",
  },
  {
    selector: ".pc-product-picker__button",
    title: "Add product",
    mode: "replace-generic",
  },
  {
    selector: ".pc-product-picker__option",
    title: (element) => getAuthoredTitle(element) || `Add ${getElementText(element)}`,
    mode: "fill-empty",
  },
  {
    selector: "[data-clear-all-filters], .pc-filter-clear-all",
    title: "Clear all filters",
    mode: "replace-generic",
  },
  {
    selector: ".pc-filter-select-all, [data-filter-select-all]",
    title: "Select all values",
    mode: "replace-generic",
  },
  {
    selector: ".pc-filter-clear, [data-filter-clear]",
    title: "Clear selection",
    mode: "replace-generic",
  },
  {
    selector: ".pc-filter-reset, [data-filter-reset]",
    title: "Reset range",
    mode: "replace-generic",
  },
  {
    selector: "calcite-slider[data-filter-range]",
    title: "Filter by display scale",
    mode: "fill-empty",
  },
  {
    selector: ".pc-dashboard-refresh-button",
    title: "Refresh activity",
    mode: "replace-generic",
  },
  {
    selector: ".pc-dashboard-range-date-button",
    title: (element) => {
      return `Choose ${getAriaLabel(element) || "date"}`;
    },
    mode: "replace-generic",
  },
  {
    selector: ".pc-dashboard-date-picker__nav",
    title: (element) => getAriaLabel(element),
    mode: "fill-empty",
  },
  {
    selector: ".pc-dashboard-date-picker__day",
    title: (element) => `Select ${element.dataset.dateValue || getElementText(element)}`,
    mode: "replace-generic",
  },
  {
    selector: ".pc-dashboard-date-picker__clear",
    title: "Clear end date",
    mode: "replace-generic",
  },
  {
    selector: ".pc-dashboard-summary-row, .pc-dashboard-summary-panel__row",
    title: "Filter activity by this value",
    mode: "fill-empty",
  },
  {
    selector: ".pc-dashboard-link-button",
    title: (element) => createDashboardLinkHelp(element),
    mode: "replace-generic",
  },
  {
    selector: ".analyze-products__action-button",
    title: (element) => createAnalyzeCollapseActionHelp(element),
    mode: "replace-generic",
  },
  {
    selector: ".pc-dashboard-history-panel__close",
    title: "Close history",
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
      getAuthoredTitle(element) || createActionTextHelp(element, "Product Collection action"),
    mode: "fill-empty",
  },
  {
    selector: ".pc-history-event__toggle, .product-history-event__toggle",
    title: "Expand or collapse history",
    mode: "fill-empty",
  },
  {
    selector:
      "button[aria-label], a[aria-label], input[aria-label], select[aria-label], calcite-action[aria-label]",
    title: (element) => getAriaLabel(element),
    mode: "fill-empty",
  },
];

const INTERACTIVE_HELP_TAGS = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "calcite-action",
  "calcite-button",
  "calcite-input",
  "calcite-combobox",
]);
const INTERACTIVE_HELP_ROLES = new Set([
  "button",
  "link",
  "menuitem",
  "tab",
  "checkbox",
  "radio",
  "combobox",
  "slider",
  "switch",
]);

let helpTooltipsInitialized = false;
let helpTooltipObserver = null;
let pendingApply = false;
let activeAnchor = null;
let activeBinding = null;

/** Register one delegated, application-owned tooltip system across the whole app. */
export function initGlobalHelpTooltips() {
  if (helpTooltipsInitialized) return;
  helpTooltipsInitialized = true;

  const start = () => {
    applyGlobalHelpTooltips();
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    observeTooltipTargets();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
    return;
  }
  start();
}

/** Convert existing authored titles to custom help without changing action behavior. */
export function applyGlobalHelpTooltips(root = document) {
  if (!root?.querySelectorAll) return;
  for (const rule of GLOBAL_HELP_RULES) {
    root.querySelectorAll(rule.selector).forEach((element) => prepareHelpElement(element, rule));
  }
  root.querySelectorAll("[title], [aria-label]").forEach((element) => {
    if (!element.hasAttribute("data-popup-help")) prepareHelpElement(element);
  });
  if (activeAnchor) {
    if (!activeAnchor.isConnected) clearActiveBinding();
    else activeBinding?.update(resolveHelpText(activeAnchor));
  }
}

function prepareHelpElement(element, matchingRule = null) {
  if (element.hasAttribute("data-popup-help")) return;
  const rule = matchingRule ?? findRule(element);
  if (!isApplicationControl(element, rule)) return;
  if (element.hasAttribute("title")) {
    // A producer may set a new title as its state changes. Capture every change.
    element.setAttribute("data-app-original-title", element.getAttribute("title") ?? "");
    element.removeAttribute("title");
  }
  const help = resolveHelpText(element, rule);
  if (!help) return;
  element.setAttribute("data-app-help", "");
  // Preserve authored accessible names; name previously derived from title when needed.
  if (!element.hasAttribute("aria-label") && isIconOnlyControl(element)) {
    element.setAttribute("aria-label", help);
  }
}

function onPointerOver(event) {
  if (isTooltipTarget(event.target)) return;
  activateHelp(event.target);
}

function onFocusIn(event) {
  activateHelp(event.target);
}

function activateHelp(start) {
  const anchor = findHelpAnchor(start);
  if (!anchor) {
    clearActiveBinding();
    return;
  }
  const text = resolveHelpText(anchor);
  if (!text) {
    clearActiveBinding();
    return;
  }
  if (anchor !== activeAnchor) {
    clearActiveBinding();
    activeAnchor = anchor;
    activeBinding = bindHelpTooltip(anchor, text);
  } else {
    activeBinding?.update(text);
  }
  // Delegated events run even if a newly inserted control was not scanned yet.
  activeBinding?.show();
}

function onPointerOut(event) {
  if (!activeAnchor?.contains?.(event.target)) return;
  if (activeAnchor.contains(event.relatedTarget) || isTooltipTarget(event.relatedTarget)) return;
  if (activeAnchor.contains(document.activeElement)) return;
  activeBinding?.hide();
}

function isTooltipTarget(target) {
  return Boolean(target?.closest?.(".pc-help-tooltip"));
}

function onFocusOut(event) {
  if (!activeAnchor?.contains?.(event.target)) return;
  if (activeAnchor.contains(event.relatedTarget) || activeAnchor.matches?.(":hover")) return;
  activeBinding?.hide();
}

function clearActiveBinding() {
  activeBinding?.destroy();
  activeBinding = null;
  activeAnchor = null;
}

function findHelpAnchor(start) {
  let element = start?.nodeType === 3 ? start.parentElement : start;
  while (element?.getAttribute && element !== document.documentElement) {
    // The popup binds its own help, but shares the same visual tooltip surface.
    if (element.hasAttribute("data-popup-help")) return null;
    const rule = findRule(element);
    if (isApplicationControl(element, rule) && hasHelpSource(element, rule)) {
      prepareHelpElement(element, rule);
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

function hasHelpSource(element, rule) {
  return Boolean(
    rule ||
    element.hasAttribute("data-app-help") ||
    element.hasAttribute("title") ||
    element.hasAttribute("data-app-original-title") ||
    element.hasAttribute("aria-label")
  );
}

function isApplicationControl(element, rule) {
  // Error text already has a separate copyable overlay on hover and focus.
  // Never add a second tooltip or treat its dialog as an action.
  if (element.matches?.(".popup-product-error") || element.closest?.(".popup-error-details")) {
    return false;
  }

  // aria-label on a table heading or action-row container is an accessible name,
  // not a request to show hover help. Preserve such labels without a tooltip.
  if (!rule && !getAuthoredTitle(element) && !isInteractiveHelpTarget(element)) {
    return false;
  }

  // Never attach delegated help to ArcGIS-owned map chrome, even if a generic
  // aria-label selector matches its internal button. Application popup help is
  // bound explicitly and custom map overlays use their own stable host classes.
  if (element.closest?.("#viewDiv")) {
    const ownedSurface = element.closest?.(
      ".popup-container, .popup-action-dropdown, .main-map-product-search, .main-map-locator, .product-collection-tray, .overlap-picker"
    );
    if (ownedSurface) return true;
    return Boolean(rule && rule !== GLOBAL_HELP_RULES.at(-1));
  }
  return true;
}

function isInteractiveHelpTarget(element) {
  const tag = element.tagName?.toLowerCase();
  const role = element.getAttribute?.("role");
  return (
    INTERACTIVE_HELP_TAGS.has(tag) ||
    INTERACTIVE_HELP_ROLES.has(role) ||
    (element.hasAttribute?.("tabindex") && Number(element.getAttribute("tabindex")) >= 0)
  );
}

function findRule(element) {
  return GLOBAL_HELP_RULES.find((rule) => element.matches?.(rule.selector)) ?? null;
}

function resolveHelpText(element, rule = findRule(element)) {
  const authoredTitle = getAuthoredTitle(element);
  if (rule) {
    const ruleText = typeof rule.title === "function" ? rule.title(element) : rule.title;
    if (
      authoredTitle &&
      (rule.mode === "fill-empty" ||
        (rule.mode === "replace-generic" && !isGenericTooltip(element, authoredTitle)))
    ) {
      return normalizeHelpText(authoredTitle);
    }
    return normalizeHelpText(ruleText || authoredTitle);
  }
  return normalizeHelpText(authoredTitle || getAriaLabel(element));
}

function getAuthoredTitle(element) {
  return normalizeText(
    element.getAttribute("title") ?? element.getAttribute("data-app-original-title")
  );
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
    (typeof HTMLButtonElement !== "undefined" &&
      element instanceof HTMLButtonElement &&
      !getElementText(element))
  );
}

function createDashboardLinkHelp(element) {
  const dashboardLinkHelp = {
    Review: "Open Review",
    Analyze: "Open Analyze",
    History: "Open product history",
    "IC-ENC": "Open the IC-ENC report",
    Validation: "Open the validation report",
  };
  return (
    dashboardLinkHelp[getElementText(element)] || createActionTextHelp(element, "Dashboard action")
  );
}

function createAnalyzeCollapseActionHelp(element) {
  const text = getElementText(element);
  if (text === "Open all") return "Open all sections";
  if (text === "Collapse all") return "Collapse all sections";
  return createActionTextHelp(element, "Analyze action");
}

function createPopupActionHelp(element) {
  const actionId = element.dataset?.actionId ?? element.getAttribute("data-action-id") ?? "";
  const actionHelp = {
    "freeze-feature": "Freeze product",
    "unfreeze-feature": "Unfreeze product",
    "send-immediately": "Send product to IC-ENC",
    export: "Export product",
    "export-all": "Export all formats",
    "export-all-edition": "Export all editions",
    "export-all-update": "Export all updates",
    "export-s57": "Export S-57",
    "s57-export-edition": "Export S-57 Edition",
    "s57-export-update": "Export S-57 Update",
    "export-s100": "Export S-101",
    "s100-export-edition": "Export S-101 Edition",
    "s100-export-update": "Export S-101 Update",
    rollback: "Cancel export",
    analyze: "Open Analyze",
    history: "Open product history",
    tools: "More actions",
  };
  return actionHelp[actionId] || createActionTextHelp(element, "Product action");
}

function createActionTextHelp(element, fallback) {
  return (
    getElementText(element) ||
    getAriaLabel(element) ||
    normalizeText(element.getAttribute("text")) ||
    fallback
  );
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

function observeTooltipTargets() {
  if (helpTooltipObserver || !document.documentElement) return;
  helpTooltipObserver = new MutationObserver(scheduleTooltipApply);
  helpTooltipObserver.observe(document.documentElement, {
    childList: true,
    attributes: true,
    attributeFilter: ["title", "aria-label", "label", "text", "disabled", "aria-disabled"],
    subtree: true,
  });
}

function scheduleTooltipApply() {
  if (pendingApply) return;
  pendingApply = true;
  window.requestAnimationFrame(() => {
    pendingApply = false;
    applyGlobalHelpTooltips();
  });
}
