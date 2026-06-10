let activeResolver = null;
let activeAnchorElement = null;
let activePreviouslyFocusedElement = null;
let handlersRegistered = false;

const PROGRAMMATIC_FOCUS_CLASS = "is-programmatically-focused";

export function confirmAction({
  title = "Confirm action",
  message = "Are you sure?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  anchorElement = null,
} = {}) {
  const { popover, card, titleElement, messageElement, confirmButton, cancelButton } =
    getConfirmElements();

  if (activeResolver) {
    closeActivePopover(false, {
      restoreFocus: false,
    });
  }

  activeAnchorElement = anchorElement;
  activePreviouslyFocusedElement = getActiveHTMLElement();

  titleElement.textContent = title;
  messageElement.textContent = message;
  confirmButton.textContent = confirmText;
  cancelButton.textContent = cancelText;

  popover.hidden = false;
  popover.setAttribute("aria-hidden", "false");

  positionPopover(card, anchorElement);

  // Programmatic focus does not always match :focus-visible. Add an explicit
  // class so keyboard users can see the initial safe default action.
  requestAnimationFrame(() => {
    if (!popover.hidden) {
      void focusWithVisibleState(cancelButton);
    }
  });

  return new Promise((resolve) => {
    activeResolver = resolve;
  });
}

export function registerConfirmDialog() {
  if (handlersRegistered) {
    return;
  }

  const { popover, confirmButton, cancelButton } = getConfirmElements();

  confirmButton.addEventListener("click", () => {
    closeActivePopover(true);
  });

  cancelButton.addEventListener("click", () => {
    closeActivePopover(false);
  });

  document.addEventListener("pointerdown", (event) => {
    clearProgrammaticFocusClass();

    if (popover.hidden) {
      return;
    }

    const clickedInside = popover.contains(event.target);

    if (!clickedInside) {
      closeActivePopover(false);
    }
  });

  window.addEventListener("resize", () => {
    if (!popover.hidden) {
      closeActivePopover(false);
    }
  });

  window.addEventListener(
    "scroll",
    () => {
      if (!popover.hidden) {
        closeActivePopover(false);
      }
    },
    true
  );

  document.addEventListener("keydown", (event) => {
    if (popover.hidden) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();

      closeActivePopover(false, {
        visibleFocus: true,
      });

      return;
    }

    if (event.key === "Tab") {
      trapFocusInsidePopover(event);
    }
  });

  document.addEventListener("focusin", (event) => {
    clearProgrammaticFocusClass(event.target);
  });

  handlersRegistered = true;
}

function closeActivePopover(result, { restoreFocus = true, visibleFocus = false } = {}) {
  const { popover } = getConfirmElements();
  const resolver = activeResolver;
  const focusTarget = getFocusRestoreTarget();

  // Do this before aria-hidden/hidden. Otherwise Chrome warns because focus is
  // still inside an element that is being hidden from assistive technology.
  blurActiveElementInside(popover);

  popover.hidden = true;
  popover.setAttribute("aria-hidden", "true");

  activeResolver = null;
  activeAnchorElement = null;
  activePreviouslyFocusedElement = null;

  if (resolver) {
    resolver(result);
  }

  if (restoreFocus) {
    restoreFocusAfterActionSettles(focusTarget, {
      visibleFocus,
    });
  }
}

function trapFocusInsidePopover(event) {
  const { card } = getConfirmElements();
  const focusableElements = getFocusableElements(card);

  if (focusableElements.length === 0) {
    event.preventDefault();
    void focusWithVisibleState(card);
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement;

  if (event.shiftKey && activeElement === firstElement) {
    event.preventDefault();
    void focusWithVisibleState(lastElement);
    return;
  }

  if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault();
    void focusWithVisibleState(firstElement);
  }
}

function getConfirmElements() {
  const popover = document.getElementById("confirm-popover");
  const card = popover?.querySelector(".confirm-popover__card");
  const titleElement = document.getElementById("confirm-popover-title");
  const messageElement = document.getElementById("confirm-popover-message");
  const confirmButton = document.getElementById("confirm-popover-confirm");
  const cancelButton = document.getElementById("confirm-popover-cancel");

  if (!popover || !card || !titleElement || !messageElement || !confirmButton || !cancelButton) {
    throw new Error("Confirm popover elements were not found in the DOM");
  }

  return {
    popover,
    card,
    titleElement,
    messageElement,
    confirmButton,
    cancelButton,
  };
}

function getFocusableElements(container) {
  return [...container.querySelectorAll(getFocusableSelector())].filter((element) => {
    return !element.disabled && element.offsetParent !== null;
  });
}

function getFocusableSelector() {
  return [
    "button",
    "[href]",
    "input",
    "select",
    "textarea",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");
}

function getActiveHTMLElement() {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

function getFocusRestoreTarget() {
  if (isConnectedFocusableElement(activeAnchorElement)) {
    return activeAnchorElement;
  }

  if (isConnectedFocusableElement(activePreviouslyFocusedElement)) {
    return activePreviouslyFocusedElement;
  }

  return null;
}

function isConnectedFocusableElement(element) {
  return (
    element instanceof HTMLElement && element.isConnected && typeof element.focus === "function"
  );
}

function blurActiveElementInside(container) {
  const activeElement = getActiveHTMLElement();

  if (activeElement && container.contains(activeElement)) {
    activeElement.blur();
  }
}

function restoreFocusAfterActionSettles(element, { visibleFocus = false } = {}) {
  if (!element) {
    return;
  }

  // Confirm is often opened from an action that is temporarily busy/disabled.
  // Wait until the action promise/finally block has had time to re-enable it.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (visibleFocus) {
        void focusWithVisibleState(element);
        return;
      }

      void focusElement(element);
    });
  });
}

async function focusWithVisibleState(element) {
  if (!isConnectedFocusableElement(element)) {
    return;
  }

  clearProgrammaticFocusClass();

  await focusElement(element);

  if (isConnectedFocusableElement(element)) {
    element.classList.add(PROGRAMMATIC_FOCUS_CLASS);
  }
}

async function focusElement(element) {
  if (!isConnectedFocusableElement(element)) {
    return;
  }

  if (typeof element.setFocus === "function") {
    await element.setFocus();
    return;
  }

  element.focus();
}

function clearProgrammaticFocusClass(nextTarget = null) {
  for (const element of document.querySelectorAll(`.${PROGRAMMATIC_FOCUS_CLASS}`)) {
    if (element !== nextTarget) {
      element.classList.remove(PROGRAMMATIC_FOCUS_CLASS);
    }
  }
}

function positionPopover(card, anchorElement) {
  const viewportPadding = 12;
  const gap = 10;

  if (!anchorElement) {
    card.style.top = "80px";
    card.style.left = "50%";
    card.style.transform = "translateX(-50%)";
    card.style.setProperty("--confirm-popover-arrow-left", "50%");
    card.dataset.placement = "bottom";
    return;
  }

  const anchorRect = anchorElement.getBoundingClientRect();

  card.style.top = "0px";
  card.style.left = "0px";
  card.style.transform = "none";

  const cardRect = card.getBoundingClientRect();

  const preferredLeft = anchorRect.left + anchorRect.width / 2 - cardRect.width / 2;
  const minLeft = viewportPadding;
  const maxLeft = window.innerWidth - cardRect.width - viewportPadding;

  const left = Math.min(Math.max(preferredLeft, minLeft), Math.max(minLeft, maxLeft));

  let top = anchorRect.bottom + gap;
  let placement = "bottom";

  if (top + cardRect.height > window.innerHeight - viewportPadding) {
    const topAbove = anchorRect.top - cardRect.height - gap;

    if (topAbove >= viewportPadding) {
      top = topAbove;
      placement = "top";
    } else {
      top = Math.max(viewportPadding, window.innerHeight - cardRect.height - viewportPadding);
    }
  }

  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const arrowOffsetPx = anchorCenterX - left;
  const arrowPadding = 18;
  const clampedArrowOffsetPx = Math.min(
    Math.max(arrowOffsetPx, arrowPadding),
    cardRect.width - arrowPadding
  );

  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
  card.style.setProperty("--confirm-popover-arrow-left", `${clampedArrowOffsetPx}px`);
  card.dataset.placement = placement;
}
