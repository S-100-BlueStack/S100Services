export function createLocatorSearchSession(
  search,
  {
    isCurrent = () => true,
    onClearError,
    onSourceResetError,
    resetSourceState,
    fallbackZoomScale,
    scheduleAfterNavigation = scheduleMacrotask,
  } = {}
) {
  let active = true;

  const clearSearchUi = () => {
    try {
      search.clear?.();
    } catch (error) {
      onClearError?.(error);
    }
  };

  const resetProviderState = () => {
    try {
      resetSourceState?.();
    } catch (error) {
      onSourceResetError?.(error);
    }
  };

  const clearTransientState = () => {
    clearSearchUi();
    resetProviderState();
  };

  const clearAfterSuccessfulNavigation = () => {
    scheduleAfterNavigation(() => {
      if (!active || !isCurrent()) return;
      clearTransientState();
    });
  };

  search.autoNavigateDisabled = false;
  search.goToOverride = createLocatorGoToOverride(() => active && isCurrent(), {
    fallbackZoomScale,
    onNavigationComplete: clearAfterSuccessfulNavigation,
  });

  return {
    deactivate() {
      if (!active) return false;
      active = false;
      search.autoNavigateDisabled = true;
      clearTransientState();
      return true;
    },
    isActive: () => active,
  };
}

export function createLocatorGoToOverride(
  isNavigationAllowed,
  { fallbackZoomScale, onNavigationComplete } = {}
) {
  return async (view, goToParams = {}) => {
    if (!isNavigationAllowed()) return;
    if (typeof view?.goTo !== "function") return;

    const target = applyFallbackScale(goToParams.target, fallbackZoomScale);
    const result = await view.goTo(target, goToParams.options);

    // Search owns result selection. Clear its completed UI only after native map
    // navigation has succeeded so clear() cannot interfere with selection/goTo.
    if (isNavigationAllowed()) onNavigationComplete?.();
    return result;
  };
}

export function isEventWithinLocatorHost(event, host) {
  const path = typeof event?.composedPath === "function" ? event.composedPath() : [];
  if (path.includes(host)) return true;

  return Boolean(
    event?.target && typeof host?.contains === "function" && host.contains(event.target)
  );
}

function applyFallbackScale(target, fallbackZoomScale) {
  const scale = Number(fallbackZoomScale);
  if (!Number.isFinite(scale) || scale <= 0 || !isPointTarget(target)) return target;

  return {
    target,
    scale,
  };
}

function isPointTarget(target) {
  const geometry = target?.geometry ?? target;
  return geometry?.type === "point";
}

function scheduleMacrotask(callback) {
  setTimeout(callback, 0);
}
