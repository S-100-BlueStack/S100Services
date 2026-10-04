import { createLocatorSearchSession, isEventWithinLocatorHost } from "./locatorSearchLifecycle.js";

const LOCATOR_BUTTON_ID = "main-map-locator-button";
const LOCATOR_SURFACE_ID = "main-map-locator-surface";

export function initMainMapLocator({
  view,
  host,
  sources = [],
  searchOptions = {},
  navigationOptions = {},
  resetSourceState,
  unavailableReason = "Locator unavailable.",
  onOpen,
  onOpenStateChange,
} = {}) {
  if (!(host instanceof HTMLElement)) return createNoopLocator();

  const available = Boolean(view) && Array.isArray(sources) && sources.length > 0;
  const button = createLocatorButton({ available, unavailableReason });
  host.replaceChildren(button);

  if (!available) {
    host.dataset.locatorState = "unavailable";
    return createUnavailableLocator({ host });
  }

  host.dataset.locatorState = "ready";
  const surface = document.createElement("div");
  surface.id = LOCATOR_SURFACE_ID;
  surface.className = "main-map-locator__surface";
  host.replaceChildren(surface, button);
  button.setAttribute("aria-controls", LOCATOR_SURFACE_ID);

  let open = false;
  let destroyed = false;
  let activeSearchSession = null;

  const openLocator = () => {
    if (open || destroyed) return false;
    try {
      onOpen?.();
    } catch (error) {
      console.warn("[Locator] Failed to coordinate sibling search UI", error);
    }

    open = true;
    button.active = true;
    button.setAttribute("aria-expanded", "true");
    notifyOpenState(onOpenStateChange, true);

    activeSearchSession = mountSearchSession({
      view,
      surface,
      sources,
      searchOptions,
      navigationOptions,
      resetSourceState,
      isCurrent: (search) => open && !destroyed && activeSearchSession?.search === search,
    });

    const openedSession = activeSearchSession;
    void focusSearchWhenReady(openedSession.search, () =>
      Boolean(open && !destroyed && activeSearchSession === openedSession)
    );
    return true;
  };

  const closeLocator = ({ restoreFocus = false } = {}) => {
    if (!open || destroyed) return false;
    open = false;
    button.active = false;
    button.setAttribute("aria-expanded", "false");

    // Search retirement is functional state and must complete independently of
    // the decorative shell collapse owned by the shared search-controls layout.
    const closedSession = activeSearchSession;
    activeSearchSession = null;
    retireSearchSession(closedSession);
    notifyOpenState(onOpenStateChange, false);

    if (restoreFocus) {
      queueMicrotask(() => {
        if (!destroyed) button.focus({ preventScroll: true });
      });
    }
    return true;
  };

  const handleButtonClick = () => {
    if (!closeLocator({ restoreFocus: false })) openLocator();
  };
  const handleDocumentPointerDown = (event) => {
    if (!open || isEventWithinLocatorHost(event, host)) return;
    closeLocator({ restoreFocus: false });
  };
  const handleDocumentFocusIn = (event) => {
    if (!open || isEventWithinLocatorHost(event, host)) return;
    closeLocator({ restoreFocus: false });
  };

  button.addEventListener("click", handleButtonClick);
  document.addEventListener("pointerdown", handleDocumentPointerDown, true);
  document.addEventListener("focusin", handleDocumentFocusIn, true);

  return {
    open: openLocator,
    close: closeLocator,
    isOpen: () => open,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      open = false;
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
      document.removeEventListener("focusin", handleDocumentFocusIn, true);
      button.removeEventListener("click", handleButtonClick);

      const closedSession = activeSearchSession;
      activeSearchSession = null;
      retireSearchSession(closedSession);
      notifyOpenState(onOpenStateChange, false);

      host.replaceChildren();
    },
  };
}

function mountSearchSession({
  view,
  surface,
  sources,
  searchOptions,
  navigationOptions,
  resetSourceState,
  isCurrent,
}) {
  const search = document.createElement("arcgis-search");
  search.className = "main-map-locator__search";
  search.setAttribute("aria-label", "Locator");
  search.label = "Locator";
  search.view = view;
  search.sources = sources;
  Object.assign(search, searchOptions);
  search.autoDestroyDisabled = true;

  const lifecycle = createLocatorSearchSession(search, {
    isCurrent: () => isCurrent(search),
    fallbackZoomScale: navigationOptions.fallbackZoomScale,
    resetSourceState,
    onClearError: (error) => {
      console.warn("[Locator] Search state could not be cleared", error);
    },
    onSourceResetError: (error) => {
      console.warn("[Locator] Provider search state could not be reset", error);
    },
  });

  surface.replaceChildren(search);
  return { search, lifecycle };
}

function retireSearchSession(session) {
  if (!session) return;
  session.lifecycle.deactivate();
  session.search.remove();
  void destroySearchComponent(session.search);
}

async function destroySearchComponent(search) {
  try {
    await search.destroy?.();
  } catch (error) {
    console.warn("[Locator] Search component could not be destroyed cleanly", error);
  }
}

function createLocatorButton({ available, unavailableReason }) {
  const button = document.createElement("calcite-action");
  button.id = LOCATOR_BUTTON_ID;
  button.className = "main-map-locator__button";
  button.icon = "locator";
  button.scale = "s";
  button.alignment = "center";
  button.text = "Locator";
  button.textEnabled = false;
  if (!available) button.title = unavailableReason;
  button.setAttribute("aria-label", "Locator");
  button.setAttribute("aria-expanded", "false");
  button.dataset.onboardingTarget = "locator";
  if (!available) {
    button.disabled = true;
    button.classList.add("main-map-locator__button--unavailable");
    button.setAttribute("aria-disabled", "true");
  }
  return button;
}

async function focusSearchWhenReady(search, shouldFocus) {
  try {
    await search.componentOnReady?.();
    if (!shouldFocus()) return;
    await search.setFocus?.();
  } catch (error) {
    if (shouldFocus()) console.warn("[Locator] Search component could not receive focus", error);
  }
}

function notifyOpenState(callback, isOpen) {
  try {
    callback?.(isOpen);
  } catch (error) {
    console.warn("[Locator] Failed to publish layout state", error);
  }
}

function createUnavailableLocator({ host }) {
  return {
    open: () => false,
    close: () => false,
    isOpen: () => false,
    destroy() {
      host.replaceChildren();
    },
  };
}

function createNoopLocator() {
  return {
    open: () => false,
    close: () => false,
    isOpen: () => false,
    destroy() {},
  };
}
