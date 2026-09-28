let nextId = 0;

/** Owns one popup session's error overlay, outside the table's layout and clipping. */
export function createPopupErrorDetails({ document: doc = document, window: win = window } = {}) {
  let overlay = null;
  let anchor = null;
  let pinned = false;
  let disposed = false;
  let restoringFocus = false;
  const triggers = new Map();

  function close({ restoreFocus = false } = {}) {
    const previousAnchor = anchor;
    overlay?.remove();
    overlay = null;
    anchor = null;
    pinned = false;
    previousAnchor?.setAttribute("aria-expanded", "false");
    doc.removeEventListener("pointerdown", onOutsidePointer, true);
    doc.removeEventListener("focusin", onOutsidePointer);
    doc.removeEventListener("keydown", onKeydown, true);
    win.removeEventListener("resize", position);
    doc.removeEventListener("scroll", position, true);
    if (restoreFocus && previousAnchor?.isConnected) {
      restoringFocus = true;
      previousAnchor.focus({ preventScroll: true });
      restoringFocus = false;
    }
  }

  function position() {
    if (!overlay || !anchor?.isConnected) {
      close();
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const spaceAbove = Math.max(0, rect.top - 16);
    const spaceBelow = Math.max(0, win.innerHeight - rect.bottom - 16);
    const placeAbove =
      spaceAbove >= Math.min(280, overlay.offsetHeight) || spaceAbove >= spaceBelow;
    overlay.style.maxHeight = `${Math.max(40, Math.min(280, placeAbove ? spaceAbove : spaceBelow))}px`;
    const width = overlay.offsetWidth;
    const height = overlay.offsetHeight;
    const top = placeAbove ? rect.top - height - 8 : rect.bottom + 8;
    overlay.style.left = `${Math.max(8, Math.min(rect.left, win.innerWidth - width - 8))}px`;
    overlay.style.top = `${Math.max(8, Math.min(top, win.innerHeight - height - 8))}px`;
  }

  function onOutsidePointer(event) {
    if (!overlay?.contains(event.target) && !anchor?.contains(event.target)) close();
  }

  function onKeydown(event) {
    if (event.key !== "Escape" || !overlay) return;
    event.preventDefault();
    event.stopPropagation();
    close({ restoreFocus: true });
  }

  function open(button, message, label, pin) {
    if (disposed || !button.isConnected) return;
    if (anchor !== button) {
      close();
      anchor = button;
      overlay = doc.createElement("section");
      overlay.id = button.getAttribute("aria-controls");
      overlay.className = "popup-error-details";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-label", `${label} error details`);
      overlay.tabIndex = -1;
      const closeButton = doc.createElement("button");
      closeButton.type = "button";
      closeButton.className = "popup-error-details__close";
      closeButton.textContent = "Close";
      closeButton.addEventListener("click", () => close({ restoreFocus: true }));
      const text = doc.createElement("div");
      text.className = "popup-error-details__text";
      text.textContent = message;
      overlay.append(closeButton, text);
      overlay.addEventListener("pointerleave", (event) => {
        if (!pinned && !anchor?.contains(event.relatedTarget)) close();
      });
      doc.body.appendChild(overlay);
      button.setAttribute("aria-expanded", "true");
      doc.addEventListener("pointerdown", onOutsidePointer, true);
      doc.addEventListener("focusin", onOutsidePointer);
      doc.addEventListener("keydown", onKeydown, true);
      win.addEventListener("resize", position);
      doc.addEventListener("scroll", position, true);
      position();
    }
    pinned ||= pin;
    if (pin) overlay.focus({ preventScroll: true });
  }

  return {
    createTrigger(message, { key, label }) {
      if (!String(message ?? "").trim()) return null;
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "popup-product-error";
      button.textContent = "Error";
      button.setAttribute("aria-label", `${label}: show full error`);
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-controls", `popup-error-details-${++nextId}`);
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        open(button, String(message), label, true);
      });
      button.addEventListener("pointerenter", () => {
        if (!pinned && !restoringFocus) open(button, String(message), label, false);
      });
      button.addEventListener("focus", () => {
        if (!pinned && !restoringFocus) open(button, String(message), label, false);
      });
      button.addEventListener("pointerleave", (event) => {
        if (!pinned && !overlay?.contains(event.relatedTarget) && doc.activeElement !== button) {
          close();
        }
      });
      button.addEventListener("blur", (event) => {
        if (!pinned && !overlay?.contains(event.relatedTarget)) close();
      });
      triggers.set(key, button);
      return button;
    },
    beforeRender() {
      const focusedKey = [...triggers].find(
        ([, button]) =>
          button === doc.activeElement ||
          (button === anchor && overlay?.contains(doc.activeElement))
      )?.[0];
      close();
      triggers.clear();
      return focusedKey;
    },
    afterRender(focusedKey, fallback) {
      if (focusedKey !== undefined) {
        (triggers.get(focusedKey) ?? fallback)?.focus({ preventScroll: true });
      }
    },
    destroy() {
      disposed = true;
      close();
      triggers.clear();
    },
  };
}
