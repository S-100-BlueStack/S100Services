export function resolveOnboardingTarget(step, { reveal = false } = {}) {
  for (const selector of step.selectors) {
    // All targets are application-owned light DOM, including slotted content.
    for (const target of document.querySelectorAll(selector)) {
      if (!isVisibleOnboardingElement(target)) continue;
      if (reveal)
        target.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "instant" });
      if (hasVisibleArea(target)) return target;
    }
  }
  return null;
}

export function isVisibleOnboardingElement(element) {
  if (
    !(element instanceof HTMLElement) ||
    !element.isConnected ||
    !element.getClientRects().length
  ) {
    return false;
  }
  for (let current = element; current; current = current.parentElement) {
    const style = window.getComputedStyle(current);
    if (
      current.hidden ||
      current.getAttribute("aria-hidden") === "true" ||
      style.visibility === "hidden" ||
      style.display === "none"
    ) {
      return false;
    }
  }
  return true;
}

function hasVisibleArea(target) {
  const rect = target.getBoundingClientRect();
  let left = Math.max(0, rect.left);
  let top = Math.max(0, rect.top);
  const header = document.getElementById("header");
  if (header && !header.contains(target)) {
    top = Math.max(top, header.getBoundingClientRect().bottom);
  }
  let right = Math.min(window.innerWidth, rect.right);
  let bottom = Math.min(window.innerHeight, rect.bottom);
  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    const style = window.getComputedStyle(parent);
    const bounds = parent.getBoundingClientRect();
    if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
      left = Math.max(left, bounds.left);
      right = Math.min(right, bounds.right);
    }
    if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
      top = Math.max(top, bounds.top);
      bottom = Math.min(bottom, bounds.bottom);
    }
  }
  return right > left && bottom > top;
}

// Selection prerequisites are based on rendered application-owned controls;
// loading and Product resolution remain owned by Analyze/Review and the map.
export function getOnboardingStepRequirement(step, { mapView = null } = {}) {
  const requirements = {
    "analyze-selection": {
      selector: ".analyze-dataset-list__item",
      message: "Add a Product to continue.",
    },
    "analyze-content": {
      selector: ".analyze-product-card",
      message: "Wait for Product content to load before continuing.",
    },
    "review-selection": {
      selector: ".pc-review-product-list__item",
      message: "Add a Product to continue.",
    },
    "review-content": {
      selector: ".pc-review-column",
      message: "Wait for Product content to load before continuing.",
    },
  };
  if (step?.requires === "main-product-popup") {
    return isProductPopupOpen(mapView)
      ? { ready: true, message: null }
      : { ready: false, message: "Open a Product on the map to continue." };
  }
  const requirement = requirements[step?.requires];
  if (!requirement) return { ready: true, message: null };
  const available = [...document.querySelectorAll(requirement.selector)].some(
    isVisibleOnboardingElement
  );
  return { ready: available, message: available ? null : requirement.message };
}

export function isProductPopupOpen(mapView) {
  const popup = mapView?.popup;
  const attributes = popup?.selectedFeature?.attributes;
  return Boolean(
    popup?.visible &&
    attributes &&
    (attributes.datasetName || attributes.DatasetName || attributes.productKey) &&
    !(popup.content instanceof HTMLElement && popup.content.classList?.contains?.("overlap-picker"))
  );
}

// Popup content is created by Product Catalogue and provided through the public
// popup.content property. Never traverse private ArcGIS or Calcite shadow roots.
export function resolveOnboardingPopupTarget(step, mapView, { collectionButton = null } = {}) {
  if (!step?.popupAnchor || !isProductPopupOpen(mapView)) return null;
  const popup = mapView.popup;
  const content = popup.content instanceof HTMLElement ? popup.content : null;
  const container = isVisibleOnboardingElement(popup.container) ? popup.container : null;
  if (step.popupAnchor === "collection") {
    // The popup owner provides its existing action element. Do not traverse
    // Calcite's private shadow tree to look up the header control.
    return isVisibleOnboardingElement(collectionButton) ? collectionButton : null;
  }
  if (step.popupAnchor === "actions") {
    const actionBar = content?.querySelector(".popup-action-bar");
    if (isVisibleOnboardingElement(actionBar)) return actionBar;
  }
  if (step.popupAnchor === "popup") {
    return container ?? (isVisibleOnboardingElement(content) ? content : null);
  }
  return isVisibleOnboardingElement(content) ? content : container;
}

export function resolveOnboardingHighlights(step, fallbackTarget) {
  // Missing/unsupported collection actions must never highlight the entire popup
  // as though the user could click it to add the Product.
  if (
    step?.popupAnchor === "collection" &&
    !fallbackTarget.matches(".popup-product-collection-btn")
  ) {
    return [];
  }
  if (!step?.highlightSelectors && !step?.highlightAll) return [fallbackTarget];
  const selectors = step.highlightSelectors ?? step.selectors;
  const highlights = [];
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      if (!isVisibleOnboardingElement(element) || !hasVisibleArea(element)) continue;
      highlights.push(element);
      if (!step.highlightAll) break;
    }
  }
  return highlights.length > 0 ? [...new Set(highlights)] : [fallbackTarget];
}
