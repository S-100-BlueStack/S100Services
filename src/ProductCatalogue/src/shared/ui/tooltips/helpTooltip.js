let nextHelpId = 0;
let activeHelp = null;

/** Shared, non-interactive help for application-owned controls, including the map popup. */
export function bindHelpTooltip(anchor, initialText = "", { popup = false } = {}) {
  const id = `pc-help-tooltip-${++nextHelpId}`;
  let text = normalizeHelpText(initialText);
  let hovered = false;
  let focused = false;
  let dismissed = false;
  let disposed = false;
  let help = null;
  let pointerPosition = null;

  const controller = { hide };

  function show() {
    if (disposed || dismissed || help || !text || !anchor.isConnected) return;
    activeHelp?.hide();
    const element = document.createElement("div");
    element.id = id;
    element.className = "pc-help-tooltip popup-action-help popup-package-action-help";
    element.setAttribute("role", "tooltip");
    element.textContent = text;
    document.body.appendChild(element);
    help = element;
    activeHelp = controller;
    const previousDescription = anchor.getAttribute("aria-describedby");
    anchor.setAttribute("aria-describedby", [previousDescription, id].filter(Boolean).join(" "));
    positionHelp(anchor, element, hovered ? pointerPosition : null);
    document.addEventListener("keydown", onEscape, true);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
  }

  function hide() {
    if (!help) return;
    help.remove();
    help = null;
    const describedBy = String(anchor.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter((value) => value && value !== id);
    if (describedBy.length) anchor.setAttribute("aria-describedby", describedBy.join(" "));
    else anchor.removeAttribute("aria-describedby");
    if (activeHelp === controller) activeHelp = null;
    document.removeEventListener("keydown", onEscape, true);
    document.removeEventListener("scroll", hide, true);
    window.removeEventListener("resize", hide);
  }

  function onPointerEnter(event) {
    hovered = true;
    dismissed = false;
    pointerPosition = readPointerPosition(event);
    show();
    if (help) positionHelp(anchor, help, pointerPosition);
  }

  function onPointerMove(event) {
    // Delegated help can be bound after pointerenter has already fired.
    if (!help || disposed || dismissed) return;
    const nextPosition = readPointerPosition(event);
    if (!nextPosition) return;
    hovered = true;
    pointerPosition = nextPosition;
    positionHelp(anchor, help, pointerPosition);
  }

  function onPointerLeave() {
    hovered = false;
    pointerPosition = null;
    if (!focused) hide();
    else if (help) positionHelp(anchor, help);
  }

  function onFocus() {
    focused = true;
    dismissed = false;
    show();
  }

  function onBlur() {
    focused = false;
    if (!hovered) hide();
  }

  function onEscape(event) {
    if (event.key !== "Escape") return;
    if (popup) {
      event.preventDefault();
      // Preserve the Tools menu's own Escape handling.
      if (!anchor.closest?.(".popup-action-dropdown")) event.stopPropagation();
    }
    dismissed = true;
    hide();
  }

  anchor.addEventListener("pointerenter", onPointerEnter);
  anchor.addEventListener("pointermove", onPointerMove);
  anchor.addEventListener("pointerleave", onPointerLeave);
  anchor.addEventListener("focus", onFocus);
  anchor.addEventListener("focusin", onFocus);
  anchor.addEventListener("blur", onBlur);
  anchor.addEventListener("focusout", onBlur);
  if (popup) anchor.setAttribute("data-popup-help", "");

  return {
    show,
    update(nextText) {
      text = normalizeHelpText(nextText);
      // A browser-native title must never coexist with application-owned help.
      anchor.removeAttribute("title");
      if (!text) hide();
      else if (help) {
        help.textContent = text;
        positionHelp(anchor, help, hovered ? pointerPosition : null);
      }
    },
    hide,
    destroy() {
      if (disposed) return;
      disposed = true;
      hide();
      anchor.removeEventListener("pointerenter", onPointerEnter);
      anchor.removeEventListener("pointermove", onPointerMove);
      anchor.removeEventListener("pointerleave", onPointerLeave);
      anchor.removeEventListener("focus", onFocus);
      anchor.removeEventListener("focusin", onFocus);
      anchor.removeEventListener("blur", onBlur);
      anchor.removeEventListener("focusout", onBlur);
      if (popup) anchor.removeAttribute("data-popup-help");
    },
  };
}

export function hideActiveHelpTooltip() {
  activeHelp?.hide();
}

export function normalizeHelpText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .trim();
}

function readPointerPosition(event) {
  return Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)
    ? { x: event.clientX, y: event.clientY }
    : null;
}

function positionHelp(anchor, help, pointerPosition = null) {
  const margin = 8;
  const width = help.offsetWidth;
  const height = help.offsetHeight;

  if (pointerPosition) {
    // Follow the pointer, without ever intercepting pointer events from menu items.
    const preferredLeft = pointerPosition.x + 14;
    const left =
      preferredLeft + width <= window.innerWidth - margin
        ? preferredLeft
        : pointerPosition.x - width - 14;
    const preferredTop = pointerPosition.y + 18;
    const top =
      preferredTop + height <= window.innerHeight - margin
        ? preferredTop
        : pointerPosition.y - height - 12;
    help.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - width - margin))}px`;
    help.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - height - margin))}px`;
    return;
  }

  // Keyboard focus has no pointer coordinates; keep help adjacent to the focused control.
  const rect = anchor.getBoundingClientRect();
  const anchorWidth = Number.isFinite(rect.width)
    ? rect.width
    : Number.isFinite(rect.right)
      ? rect.right - rect.left
      : 0;
  const centered = rect.left + anchorWidth / 2 - width / 2;
  const left = Math.max(margin, Math.min(centered, window.innerWidth - width - margin));
  const below = rect.bottom + height <= window.innerHeight - margin;
  const top = below ? rect.bottom : Math.max(margin, rect.top - height);
  help.style.left = `${left}px`;
  help.style.top = `${top}px`;
}
