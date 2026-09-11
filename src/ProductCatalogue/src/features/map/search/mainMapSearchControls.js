const SEARCH_CONTROLS_ID = "main-map-search-controls";
const PRODUCT_SEARCH_HOST_ID = "main-map-product-search";
const LOCATOR_HOST_ID = "main-map-locator";
const LOCATOR_COLLAPSE_PROPERTY = "flex-basis";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function initMainMapSearchControls() {
  const header = document.getElementById("header");
  if (!header || !document.body) return createNoopSearchControls();

  document.getElementById(SEARCH_CONTROLS_ID)?.remove();
  document.getElementById(PRODUCT_SEARCH_HOST_ID)?.remove();

  const host = document.createElement("div");
  host.id = SEARCH_CONTROLS_ID;
  host.className = "main-map-search-controls";

  const productSearchHost = document.createElement("div");
  productSearchHost.id = PRODUCT_SEARCH_HOST_ID;
  productSearchHost.className = "main-map-product-search main-map-search-controls__product";
  productSearchHost.dataset.onboardingTarget = "product-search";

  const locatorHost = document.createElement("div");
  locatorHost.id = LOCATOR_HOST_ID;
  locatorHost.className = "main-map-locator main-map-search-controls__locator";

  host.append(productSearchHost, locatorHost);
  document.body.appendChild(host);

  const locatorLayout = createLocatorLayoutTransitionController({
    host,
    transitionTarget: locatorHost,
    prefersReducedMotion: () => window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches === true,
  });
  const updatePosition = () => {
    const headerBottom = document.getElementById("header")?.getBoundingClientRect().bottom ?? 0;
    host.style.setProperty("--main-map-search-controls-top", `${Math.max(8, headerBottom + 10)}px`);
  };

  updatePosition();
  window.addEventListener("resize", updatePosition);

  return {
    host,
    productSearchHost,
    locatorHost,
    setLocatorOpen: locatorLayout.setOpen,
    destroy() {
      window.removeEventListener("resize", updatePosition);
      locatorLayout.destroy();
      host.remove();
    },
  };
}

export function createLocatorLayoutTransitionController({
  host,
  transitionTarget,
  prefersReducedMotion = () => false,
} = {}) {
  if (!host?.dataset || !transitionTarget?.addEventListener) {
    return createNoopLocatorLayoutTransitionController();
  }

  let state = "closed";
  let generation = 0;
  let removePendingTransitionListener = null;

  const publishState = (nextState, isOpen) => {
    state = nextState;
    host.dataset.locatorState = nextState;
    host.dataset.locatorOpen = isOpen ? "true" : "false";
  };
  const clearPendingTransitionListener = () => {
    removePendingTransitionListener?.();
    removePendingTransitionListener = null;
  };
  const finalizeClose = (closeGeneration) => {
    if (state !== "closing" || generation !== closeGeneration) return false;
    clearPendingTransitionListener();
    publishState("closed", false);
    return true;
  };

  const setOpen = (isOpen) => {
    if (isOpen) {
      if (state === "open") return false;
      generation += 1;
      clearPendingTransitionListener();
      publishState("open", true);
      return true;
    }

    if (state === "closed" || state === "closing") return false;

    const closeGeneration = ++generation;
    clearPendingTransitionListener();
    publishState("closing", false);

    if (safePrefersReducedMotion(prefersReducedMotion)) {
      finalizeClose(closeGeneration);
      return true;
    }

    const handleTransitionEnd = (event) => {
      if (event?.target !== transitionTarget || event?.propertyName !== LOCATOR_COLLAPSE_PROPERTY) {
        return;
      }
      finalizeClose(closeGeneration);
    };

    transitionTarget.addEventListener("transitionend", handleTransitionEnd);
    removePendingTransitionListener = () => {
      transitionTarget.removeEventListener("transitionend", handleTransitionEnd);
    };
    return true;
  };

  publishState("closed", false);

  return {
    setOpen,
    getState: () => state,
    destroy() {
      generation += 1;
      clearPendingTransitionListener();
      publishState("closed", false);
    },
  };
}

function safePrefersReducedMotion(prefersReducedMotion) {
  try {
    return prefersReducedMotion?.() === true;
  } catch {
    return false;
  }
}

function createNoopSearchControls() {
  return {
    host: null,
    productSearchHost: null,
    locatorHost: null,
    setLocatorOpen() {},
    destroy() {},
  };
}

function createNoopLocatorLayoutTransitionController() {
  return {
    setOpen: () => false,
    getState: () => "closed",
    destroy() {},
  };
}
