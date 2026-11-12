const SEARCH_CONTROLS_ID = "main-map-search-controls";
const PRODUCT_SEARCH_HOST_ID = "main-map-product-search";
const PRODUCT_SEARCH_BUTTON_ID = "main-map-product-search-button";
const LOCATOR_HOST_ID = "main-map-locator";
const PRODUCT_POPOVER_ID = "main-product-search";
const LOCATOR_POPOVER_ID = "main-locator-search";
const SEARCH_SURFACE_WIDTH = 352;

export function initMainMapSearchControls({ navbarPopoverCoordinator } = {}) {
  const header = document.getElementById("header");
  const headerActions = header?.querySelector(".header-right");
  if (!headerActions) return createNoopSearchControls();

  document.getElementById(SEARCH_CONTROLS_ID)?.remove();
  document.getElementById(PRODUCT_SEARCH_HOST_ID)?.remove();

  const host = document.createElement("div");
  host.id = SEARCH_CONTROLS_ID;
  host.className = "main-map-search-controls";
  host.dataset.locatorOpen = "false";

  const productButton = document.createElement("calcite-action");
  productButton.id = PRODUCT_SEARCH_BUTTON_ID;
  productButton.className = "main-map-product-search__button";
  productButton.icon = "search";
  productButton.text = "Product search";
  productButton.textEnabled = false;
  productButton.scale = "m";
  productButton.alignment = "center";
  productButton.setAttribute("aria-label", "Search products");
  productButton.setAttribute("aria-expanded", "false");
  productButton.setAttribute("aria-controls", PRODUCT_SEARCH_HOST_ID);
  productButton.dataset.onboardingTarget = "product-search";

  const productSearchHost = document.createElement("div");
  productSearchHost.id = PRODUCT_SEARCH_HOST_ID;
  productSearchHost.className = "main-map-product-search main-map-search-controls__product";
  productSearchHost.hidden = true;
  productSearchHost.setAttribute("role", "dialog");
  productSearchHost.setAttribute("aria-label", "Product search");
  productSearchHost.setAttribute("aria-modal", "false");

  const locatorHost = document.createElement("div");
  locatorHost.id = LOCATOR_HOST_ID;
  locatorHost.className = "main-map-locator main-map-search-controls__locator";

  host.append(productButton, locatorHost, productSearchHost);
  headerActions.prepend(host);
  header.classList.add("has-main-map-search");

  let productSearch = null;
  let locator = null;
  let unregisterProduct = null;
  let unregisterLocator = null;
  let destroyed = false;

  function positionSurfaces() {
    if (destroyed || !header?.getBoundingClientRect || !host?.getBoundingClientRect) return;
    const headerRect = header.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 1024;
    const surfaceWidth = Math.min(SEARCH_SURFACE_WIDTH, Math.max(0, viewportWidth - 24));
    const left = Math.max(12, Math.min(hostRect.left, viewportWidth - surfaceWidth - 12));
    host.style.setProperty("--pc-main-search-top", `${Math.round(headerRect.bottom + 6)}px`);
    host.style.setProperty("--pc-main-search-left", `${Math.round(left)}px`);
  }

  function openProduct({ focusInitial = true } = {}) {
    if (destroyed || !productSearch) return;
    positionSurfaces();
    productSearchHost.hidden = false;
    productButton.active = true;
    productButton.setAttribute("aria-expanded", "true");
    if (focusInitial) productSearch.focusInput?.();
  }

  function closeProduct({ restoreFocus = false } = {}) {
    if (productSearchHost.hidden) return;
    productSearchHost.hidden = true;
    productButton.active = false;
    productButton.setAttribute("aria-expanded", "false");
    productSearch?.close?.();
    productSearch?.cancelPendingSelection?.();
    if (restoreFocus && !destroyed) productButton.focus?.({ preventScroll: true });
  }

  function openLocator() {
    if (destroyed || !locator) return;
    positionSurfaces();
    locator.open?.();
  }

  function closeLocator(options = {}) {
    locator?.close?.(options);
  }

  function handleProductClick() {
    navbarPopoverCoordinator?.toggle(PRODUCT_POPOVER_ID);
  }

  return {
    host,
    productButton,
    productSearchHost,
    locatorHost,
    setLocatorOpen(isOpen) {
      host.dataset.locatorOpen = isOpen ? "true" : "false";
    },
    toggleLocator() {
      return navbarPopoverCoordinator?.toggle(LOCATOR_POPOVER_ID) ?? false;
    },
    closeProductFromEscape() {
      return navbarPopoverCoordinator?.close(PRODUCT_POPOVER_ID, { restoreFocus: true }) ?? false;
    },
    closeProductAfterSelection() {
      const focusWasInside = productSearchHost.contains(document.activeElement);
      const closed =
        navbarPopoverCoordinator?.close(PRODUCT_POPOVER_ID, { restoreFocus: false }) ?? false;
      // Avoid leaving keyboard focus inside a newly hidden search surface.
      if (closed && focusWasInside) productButton.focus?.({ preventScroll: true });
      return closed;
    },
    bind({ productSearch: nextProductSearch, locator: nextLocator } = {}) {
      if (destroyed || productSearch || locator) return false;
      productSearch = nextProductSearch;
      locator = nextLocator;
      if (!productSearch || !locator || !navbarPopoverCoordinator) return false;

      unregisterProduct = navbarPopoverCoordinator.register(PRODUCT_POPOVER_ID, {
        open: openProduct,
        close: closeProduct,
        isOpen: () => !productSearchHost.hidden,
        containsTarget: (target) =>
          Boolean(target && (productButton.contains(target) || productSearchHost.contains(target))),
      });
      unregisterLocator = navbarPopoverCoordinator.register(LOCATOR_POPOVER_ID, {
        open: openLocator,
        close: closeLocator,
        isOpen: () => locator.isOpen?.() === true,
        containsTarget: (target) => Boolean(target && locatorHost.contains(target)),
      });
      productButton.addEventListener("click", handleProductClick);
      window.addEventListener("resize", positionSurfaces);
      window.addEventListener("scroll", positionSurfaces, true);
      return true;
    },
    destroy() {
      if (destroyed) return;
      // Coordinator-owned close retires open Locator requests before removing their DOM.
      unregisterProduct?.();
      unregisterLocator?.();
      productButton.removeEventListener("click", handleProductClick);
      window.removeEventListener("resize", positionSurfaces);
      window.removeEventListener("scroll", positionSurfaces, true);
      destroyed = true;
      host.remove();
      header.classList.remove("has-main-map-search");
    },
  };
}

function createNoopSearchControls() {
  return {
    host: null,
    productButton: null,
    productSearchHost: null,
    locatorHost: null,
    setLocatorOpen() {},
    toggleLocator: () => false,
    closeProductFromEscape: () => false,
    closeProductAfterSelection: () => false,
    bind: () => false,
    destroy() {},
  };
}
