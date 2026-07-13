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
  let currentTarget = null;
  let currentStep = null;
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
    tour?.reposition(currentTarget, currentStep);
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
    currentTarget = resolveTarget(currentStep.selectors);
    currentTarget?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    tour?.render({
      step: currentStep,
      index: currentStepIndex,
      count: steps.length,
      target: currentTarget,
    });
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
    currentTarget = null;
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

function resolveTarget(selectors = []) {
  for (const selector of selectors) {
    const target = document.querySelector(selector);
    if (target instanceof HTMLElement && !target.hidden && target.getClientRects().length > 0) {
      return target;
    }
  }
  return null;
}
