export const VISIBLE_FOCUS_CLASS = "is-visible-focused";

let globalInputListenersRegistered = false;
let lastInteractionWasKeyboard = false;

export function bindVisibleFocusState(element) {
  if (!(element instanceof HTMLElement)) {
    return () => {};
  }

  registerGlobalInputListeners();

  const handleFocus = () => {
    if (lastInteractionWasKeyboard && isConnectedFocusableElement(element)) {
      element.classList.add(VISIBLE_FOCUS_CLASS);
    }
  };

  const handleBlur = () => {
    element.classList.remove(VISIBLE_FOCUS_CLASS);
  };

  const handlePointerDown = () => {
    element.classList.remove(VISIBLE_FOCUS_CLASS);
  };

  element.addEventListener("focus", handleFocus);
  element.addEventListener("blur", handleBlur);
  element.addEventListener("pointerdown", handlePointerDown);

  return () => {
    element.removeEventListener("focus", handleFocus);
    element.removeEventListener("blur", handleBlur);
    element.removeEventListener("pointerdown", handlePointerDown);
  };
}

export async function focusWithVisibleState(element) {
  if (!isConnectedFocusableElement(element)) {
    return;
  }

  registerGlobalInputListeners();
  clearVisibleFocusClass(element);

  await focusElement(element);

  if (isConnectedFocusableElement(element)) {
    element.classList.add(VISIBLE_FOCUS_CLASS);
  }
}

export async function focusElement(element) {
  if (!isConnectedFocusableElement(element)) {
    return;
  }

  if (typeof element.setFocus === "function") {
    await element.setFocus();
    return;
  }

  element.focus();
}

export function clearVisibleFocusClass(nextTarget = null) {
  for (const element of document.querySelectorAll(`.${VISIBLE_FOCUS_CLASS}`)) {
    if (element !== nextTarget) {
      element.classList.remove(VISIBLE_FOCUS_CLASS);
    }
  }
}

function registerGlobalInputListeners() {
  if (globalInputListenersRegistered) {
    return;
  }

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      lastInteractionWasKeyboard = true;
    },
    true
  );

  document.addEventListener(
    "pointerdown",
    () => {
      lastInteractionWasKeyboard = false;
      clearVisibleFocusClass();
    },
    true
  );

  document.addEventListener(
    "focusin",
    (event) => {
      clearVisibleFocusClass(event.target);
    },
    true
  );

  globalInputListenersRegistered = true;
}

function isConnectedFocusableElement(element) {
  return (
    element instanceof HTMLElement &&
    element.isConnected &&
    typeof element.focus === "function" &&
    !isDisabledElement(element)
  );
}

function isDisabledElement(element) {
  return (
    element.disabled === true ||
    element.hasAttribute("disabled") ||
    element.getAttribute("aria-disabled") === "true"
  );
}
