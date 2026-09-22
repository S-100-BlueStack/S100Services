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
