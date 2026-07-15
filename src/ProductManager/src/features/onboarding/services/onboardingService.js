import { getOnboardingSteps } from "../config/onboardingSteps.js";
import { readOnboardingState, writeOnboardingState } from "../state/onboardingStorage.js";
import {
  createStopIntroductionDialog,
  createTourPopover,
  createWelcomeDialog,
} from "../ui/onboardingUi.js";

let activeService = null;

export function initOnboarding({ routeName }) {
  activeService?.destroy();
  activeService = createOnboardingService({ routeName });
  return activeService;
}

export function getOnboardingService() {
  return activeService;
}

function createOnboardingService({ routeName }) {
  let routeReady = false;
  let welcomeOffered = false;
  let welcomeDialog = null;
  let stopDialog = null;
  let tour = null;
  let currentStepIndex = 0;
  let currentTargets = [];
  let currentStep = null;
  let targetRefreshFrame = null;
  let targetRefreshAttempts = 0;
  let previousFocus = null;
  let state = readOnboardingState();

  const handleKeydown = (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;

    if (stopDialog) {
      event.preventDefault();
      closeStopDialog();
      return;
    }

    if (tour) {
      event.preventDefault();
      requestStopIntroduction();
      return;
    }

    if (welcomeDialog) {
      event.preventDefault();
      closeActiveUi();
    }
  };

  const handleViewportChange = () => {
    scheduleTargetRefresh(1);
  };

  document.addEventListener("keydown", handleKeydown, true);
  window.addEventListener("resize", handleViewportChange);
  window.addEventListener("scroll", handleViewportChange, true);

  function setRouteReady() {
    routeReady = true;

    if (
      routeName === "main" &&
      !welcomeOffered &&
      !state.dismissedWelcome &&
      state.completedFlows.main !== true
    ) {
      welcomeOffered = true;
      showWelcome();
    }
  }

  function showWelcome() {
    closeActiveUi();
    previousFocus = document.activeElement;
    welcomeDialog = createWelcomeDialog({
      onStart: () => {
        welcomeDialog?.close({ restoreFocus: false });
        welcomeDialog = null;
        startCurrentRoute({ manual: false });
      },
      onNotNow: () => closeActiveUi(),
      onDismiss: () => {
        state = writeOnboardingState({ ...state, dismissedWelcome: true });
        closeActiveUi();
      },
    });
  }

  function startCurrentRoute({ manual = true } = {}) {
    if (!routeReady) return false;
    const steps = getOnboardingSteps(routeName);
    if (steps.length === 0) return false;

    closeActiveUi({ restoreFocus: false });
    previousFocus = document.activeElement;
    currentStepIndex = 0;
    tour = createTourPopover({
      onBack: () => showStep(currentStepIndex - 1),
      onNext: () => {
        if (currentStepIndex >= steps.length - 1) {
          completeCurrentFlow();
          return;
        }
        showStep(currentStepIndex + 1);
      },
      onRequestClose: requestStopIntroduction,
    });
    showStep(0);
    return manual;
  }

  function showStep(index) {
    const steps = getOnboardingSteps(routeName);
    currentStepIndex = Math.min(Math.max(index, 0), steps.length - 1);
    currentStep = steps[currentStepIndex];
    currentTargets = resolveTargets(currentStep);

    currentTargets[0]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    tour?.render({
      step: currentStep,
      index: currentStepIndex,
      count: steps.length,
      targets: currentTargets,
    });

    // ArcGIS and Calcite can attach popup controls through nested shadow roots
    // over several frames. Re-resolving briefly keeps the outline aligned without
    // changing the popup's own stacking context or layout.
    scheduleTargetRefresh(6);
  }

  function scheduleTargetRefresh(attempts = 1) {
    targetRefreshAttempts = Math.max(targetRefreshAttempts, attempts);

    if (targetRefreshFrame !== null) {
      return;
    }

    targetRefreshFrame = window.requestAnimationFrame(runTargetRefresh);
  }

  function runTargetRefresh() {
    targetRefreshFrame = null;

    if (!tour || !currentStep) {
      targetRefreshAttempts = 0;
      return;
    }

    currentTargets = resolveTargets(currentStep);
    tour.reposition(currentTargets, currentStep);
    targetRefreshAttempts -= 1;

    if (targetRefreshAttempts > 0) {
      targetRefreshFrame = window.requestAnimationFrame(runTargetRefresh);
    }
  }

  function cancelTargetRefresh() {
    targetRefreshAttempts = 0;

    if (targetRefreshFrame !== null) {
      window.cancelAnimationFrame(targetRefreshFrame);
      targetRefreshFrame = null;
    }
  }

  function requestStopIntroduction() {
    if (!tour || stopDialog) return;

    stopDialog = createStopIntroductionDialog({
      onContinue: closeStopDialog,
      onStop: () => {
        closeStopDialog();
        closeActiveUi();
      },
    });
  }

  function closeStopDialog() {
    stopDialog?.remove();
    stopDialog = null;
  }

  function completeCurrentFlow() {
    state = writeOnboardingState({
      ...state,
      completedFlows: {
        ...state.completedFlows,
        [routeName]: true,
      },
    });
    closeActiveUi();
  }

  function closeActiveUi({ restoreFocus = true } = {}) {
    closeStopDialog();
    welcomeDialog?.close({ restoreFocus: false });
    welcomeDialog = null;
    tour?.remove();
    tour = null;
    cancelTargetRefresh();
    currentTargets = [];
    currentStep = null;

    if (restoreFocus && previousFocus instanceof HTMLElement) {
      previousFocus.focus({ preventScroll: true });
    }
  }

  return {
    setRouteReady,
    startCurrentRoute,
    destroy() {
      closeActiveUi({ restoreFocus: false });
      document.removeEventListener("keydown", handleKeydown, true);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    },
  };
}

function resolveTargets(step) {
  if (step?.selectorMode === "all") {
    return resolveAllVisibleElements(step.selectors);
  }

  const target = resolveFirstVisibleElement(step?.selectors);
  return target ? [target] : [];
}

function resolveFirstVisibleElement(selectors = []) {
  const roots = collectQueryRoots();

  for (const selector of selectors) {
    for (const root of roots) {
      const target = [...root.querySelectorAll(selector)].find(isVisibleElement);
      if (target) return target;
    }
  }
  return null;
}

function resolveAllVisibleElements(selectors = []) {
  const elements = [];
  const seen = new Set();
  const roots = collectQueryRoots();

  for (const selector of selectors) {
    for (const root of roots) {
      for (const element of root.querySelectorAll(selector)) {
        if (!isVisibleElement(element) || seen.has(element)) continue;
        seen.add(element);
        elements.push(element);
      }
    }
  }

  return elements;
}

function collectQueryRoots() {
  const roots = [];
  const pendingRoots = [document];
  const visitedRoots = new Set();

  while (pendingRoots.length > 0) {
    const root = pendingRoots.shift();

    if (!root || visitedRoots.has(root) || typeof root.querySelectorAll !== "function") {
      continue;
    }

    visitedRoots.add(root);
    roots.push(root);

    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot && !visitedRoots.has(element.shadowRoot)) {
        pendingRoots.push(element.shadowRoot);
      }
    }
  }

  return roots;
}

function isVisibleElement(element) {
  if (
    !(element instanceof HTMLElement) ||
    element.hidden ||
    element.getClientRects().length === 0
  ) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none";
}
