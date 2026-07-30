import { getOnboardingSteps, getOnboardingWelcomeContent } from "../config/onboardingSteps.js";
import {
  createOnboardingStepPresentation,
  isCollectionWaitOnboardingStep,
  isInteractiveOnboardingStep,
  isPopupRequiredOnboardingStep,
  isPopupWaitOnboardingStep,
  isTargetCountRequiredOnboardingStep,
  isTargetCountRequirementMet,
  isTargetCountWaitOnboardingStep,
} from "../domain/onboardingInteraction.js";
import { readOnboardingState, writeOnboardingState } from "../state/onboardingStorage.js";
import {
  createStopIntroductionDialog,
  createTourPopover,
  createWelcomeDialog,
} from "../ui/onboardingUi.js";

const INTERACTION_POLL_INTERVAL_MS = 150;
const POPUP_CLOSE_GRACE_MS = 350;
const POPUP_TARGET_SELECTORS = [".popup-action-bar"];
const COLLECTION_TARGET_SELECTORS = [".pc-product-collection-tray"];

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
  let currentStep = null;
  let currentRenderedStep = null;
  let currentTargets = [];
  let currentPositionTargets = [];
  let targetRefreshFrame = null;
  let targetRefreshAttempts = 0;
  let interactionIntervalId = null;
  let interactionFallbackTimeoutId = null;
  let interactionState = readInteractionState();
  let allowMapAutoAdvance = false;
  let allowTargetAutoAdvance = false;
  let previousFocus = null;
  let state = readOnboardingState(routeName);

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

    if (!welcomeOffered && !state.dismissedWelcome && !state.completed) {
      welcomeOffered = true;
      showWelcome();
    }
  }

  function showWelcome() {
    closeActiveUi();
    previousFocus = document.activeElement;
    const welcomeContent = getOnboardingWelcomeContent(routeName);
    welcomeDialog = createWelcomeDialog({
      title: welcomeContent.title,
      description: welcomeContent.description,
      onStart: () => {
        welcomeDialog?.close({ restoreFocus: false });
        welcomeDialog = null;
        startCurrentRoute({ manual: false });
      },
      onNotNow: () => closeActiveUi(),
      onDismiss: () => {
        state = writeOnboardingState(routeName, {
          ...state,
          dismissedWelcome: true,
        });
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
      onNext: handleNext,
      onRequestClose: requestStopIntroduction,
    });

    showStep(0);
    return manual;
  }

  function handleNext() {
    const presentation = createCurrentStepPresentation();

    if (presentation.nextDisabled) {
      return;
    }

    const steps = getOnboardingSteps(routeName);

    if (currentStepIndex >= steps.length - 1) {
      completeCurrentFlow();
      return;
    }

    showStep(currentStepIndex + 1);
  }

  function showStep(index, { focusNext = true } = {}) {
    const steps = getOnboardingSteps(routeName);
    currentStepIndex = Math.min(Math.max(index, 0), steps.length - 1);
    currentStep = steps[currentStepIndex];
    interactionState = readInteractionState(currentStep);
    cancelInteractionFallback();

    if (isPopupRequiredOnboardingStep(currentStep) && !interactionState.popupOpen) {
      showStep(findStepIndex(currentStep.behavior?.fallbackStepId, currentStepIndex - 1), {
        focusNext: false,
      });
      return;
    }

    if (
      isTargetCountRequiredOnboardingStep(currentStep) &&
      !isTargetCountRequirementMet(currentStep, interactionState.targetCount)
    ) {
      showStep(findStepIndex(currentStep.behavior?.fallbackStepId, currentStepIndex - 1), {
        focusNext: false,
      });
      return;
    }

    allowMapAutoAdvance = isPopupWaitOnboardingStep(currentStep) && !interactionState.popupOpen;
    allowTargetAutoAdvance =
      isTargetCountWaitOnboardingStep(currentStep) &&
      !isTargetCountRequirementMet(currentStep, interactionState.targetCount);

    renderCurrentStep({ focusNext });
    syncInteractionPolling();
  }

  function renderCurrentStep({ focusNext = false } = {}) {
    if (!tour || !currentStep) {
      return;
    }

    const steps = getOnboardingSteps(routeName);
    const presentation = createCurrentStepPresentation();
    currentRenderedStep = presentation.step;
    currentTargets = resolveTargets(currentRenderedStep);
    currentPositionTargets = resolvePositionTargets(currentRenderedStep);

    currentTargets[0]?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
    tour.render({
      step: currentRenderedStep,
      index: currentStepIndex,
      count: steps.length,
      targets: currentTargets,
      positionTargets: currentPositionTargets,
      nextDisabled: presentation.nextDisabled,
      nextLabel: presentation.nextLabel,
      nextTitle: presentation.nextTitle,
      focusNext: focusNext && presentation.focusNext,
    });

    // ArcGIS and Calcite can attach popup controls through nested shadow roots
    // over several frames. Re-resolving briefly keeps the outline aligned without
    // changing the popup's own stacking context or layout.
    scheduleTargetRefresh(6);
  }

  function createCurrentStepPresentation() {
    return createOnboardingStepPresentation(currentStep, interactionState);
  }

  function syncInteractionPolling() {
    if (!isInteractiveOnboardingStep(currentStep)) {
      stopInteractionPolling();
      return;
    }

    if (interactionIntervalId !== null) {
      return;
    }

    interactionIntervalId = window.setInterval(runInteractionRefresh, INTERACTION_POLL_INTERVAL_MS);
  }

  function runInteractionRefresh() {
    if (!tour || !currentStep) {
      stopInteractionPolling();
      return;
    }

    const previousState = interactionState;
    const nextState = readInteractionState(currentStep);
    interactionState = nextState;

    if (isPopupWaitOnboardingStep(currentStep)) {
      handlePopupWaitStep(previousState, nextState);
      return;
    }

    if (isPopupRequiredOnboardingStep(currentStep)) {
      handlePopupRequiredStep(nextState);
      return;
    }

    if (isCollectionWaitOnboardingStep(currentStep)) {
      handleCollectionWaitStep(previousState, nextState);
      return;
    }

    if (isTargetCountWaitOnboardingStep(currentStep)) {
      handleTargetCountWaitStep(previousState, nextState);
      return;
    }

    if (isTargetCountRequiredOnboardingStep(currentStep)) {
      handleTargetCountRequiredStep(nextState);
    }
  }

  function handlePopupWaitStep(previousState, nextState) {
    if (!nextState.popupOpen) {
      allowMapAutoAdvance = true;
    }

    if (allowMapAutoAdvance && !previousState.popupOpen && nextState.popupOpen) {
      allowMapAutoAdvance = false;
      showStep(currentStepIndex + 1, { focusNext: false });
      return;
    }

    if (previousState.popupOpen !== nextState.popupOpen) {
      renderCurrentStep({ focusNext: false });
    }
  }

  function handlePopupRequiredStep(nextState) {
    if (nextState.popupOpen) {
      cancelInteractionFallback();
      scheduleTargetRefresh(2);
      return;
    }

    scheduleInteractionFallback(() => {
      if (!readInteractionState(currentStep).popupOpen) {
        showStep(findStepIndex(currentStep?.behavior?.fallbackStepId, currentStepIndex - 1), {
          focusNext: false,
        });
      }
    });
  }

  function handleCollectionWaitStep(previousState, nextState) {
    const stateChanged =
      previousState.popupOpen !== nextState.popupOpen ||
      previousState.collectionVisible !== nextState.collectionVisible;

    if (stateChanged) {
      renderCurrentStep({ focusNext: false });
    } else {
      scheduleTargetRefresh(1);
    }

    if (nextState.collectionVisible || nextState.popupOpen) {
      cancelInteractionFallback();
      return;
    }

    scheduleInteractionFallback(() => {
      const latestState = readInteractionState(currentStep);

      if (!latestState.collectionVisible && !latestState.popupOpen) {
        showStep(findStepIndex("main-map", currentStepIndex - 2), {
          focusNext: false,
        });
      }
    });
  }

  function handleTargetCountWaitStep(previousState, nextState) {
    const previousRequirementMet = isTargetCountRequirementMet(
      currentStep,
      previousState.targetCount
    );
    const nextRequirementMet = isTargetCountRequirementMet(currentStep, nextState.targetCount);

    if (
      allowTargetAutoAdvance &&
      !previousRequirementMet &&
      nextRequirementMet &&
      currentStep.behavior?.autoAdvance !== false
    ) {
      allowTargetAutoAdvance = false;
      showStep(currentStepIndex + 1, { focusNext: false });
      return;
    }

    if (previousState.targetCount !== nextState.targetCount) {
      renderCurrentStep({ focusNext: false });
    } else {
      scheduleTargetRefresh(1);
    }
  }

  function handleTargetCountRequiredStep(nextState) {
    if (isTargetCountRequirementMet(currentStep, nextState.targetCount)) {
      cancelInteractionFallback();
      scheduleTargetRefresh(1);
      return;
    }

    scheduleInteractionFallback(() => {
      const latestState = readInteractionState(currentStep);

      if (!isTargetCountRequirementMet(currentStep, latestState.targetCount)) {
        showStep(findStepIndex(currentStep?.behavior?.fallbackStepId, currentStepIndex - 1), {
          focusNext: false,
        });
      }
    });
  }

  function scheduleInteractionFallback(callback) {
    if (interactionFallbackTimeoutId !== null) {
      return;
    }

    interactionFallbackTimeoutId = window.setTimeout(() => {
      interactionFallbackTimeoutId = null;
      callback();
    }, POPUP_CLOSE_GRACE_MS);
  }

  function cancelInteractionFallback() {
    if (interactionFallbackTimeoutId === null) {
      return;
    }

    window.clearTimeout(interactionFallbackTimeoutId);
    interactionFallbackTimeoutId = null;
  }

  function stopInteractionPolling() {
    if (interactionIntervalId !== null) {
      window.clearInterval(interactionIntervalId);
      interactionIntervalId = null;
    }

    cancelInteractionFallback();
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

    if (!tour || !currentRenderedStep) {
      targetRefreshAttempts = 0;
      return;
    }

    currentTargets = resolveTargets(currentRenderedStep);
    currentPositionTargets = resolvePositionTargets(currentRenderedStep);
    tour.reposition(currentTargets, currentRenderedStep, currentPositionTargets);
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
    state = writeOnboardingState(routeName, {
      ...state,
      completed: true,
    });
    closeActiveUi();
  }

  function closeActiveUi({ restoreFocus = true } = {}) {
    closeStopDialog();
    welcomeDialog?.close({ restoreFocus: false });
    welcomeDialog = null;
    tour?.remove();
    tour = null;
    stopInteractionPolling();
    cancelTargetRefresh();
    currentTargets = [];
    currentPositionTargets = [];
    currentStep = null;
    currentRenderedStep = null;

    if (restoreFocus && previousFocus instanceof HTMLElement) {
      previousFocus.focus({ preventScroll: true });
    }
  }

  function findStepIndex(stepId, fallbackIndex) {
    const index = getOnboardingSteps(routeName).findIndex((step) => step.id === stepId);
    return index >= 0 ? index : Math.max(0, fallbackIndex);
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

function readInteractionState(step = null) {
  const roots = collectQueryRoots();

  return {
    popupOpen: Boolean(resolveFirstVisibleElement(POPUP_TARGET_SELECTORS, roots)),
    collectionVisible: Boolean(resolveFirstVisibleElement(COLLECTION_TARGET_SELECTORS, roots)),
    targetCount: countVisibleElements(step?.behavior?.selectors, roots),
  };
}

function resolveTargets(step) {
  if (step?.selectorMode === "all") {
    const targets = resolveAllVisibleElements(step.selectors);
    const maximumTargets = Number(step.maximumTargets);

    return Number.isInteger(maximumTargets) && maximumTargets > 0
      ? targets.slice(0, maximumTargets)
      : targets;
  }

  const target = resolveFirstVisibleElement(step?.selectors);
  return target ? [target] : [];
}

function resolvePositionTargets(step) {
  if (!Array.isArray(step?.positionSelectors)) {
    return [];
  }

  const target = resolveFirstVisibleElement(step.positionSelectors);
  return target ? [target] : [];
}

function resolveFirstVisibleElement(selectors = [], roots = collectQueryRoots()) {
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

function countVisibleElements(selectors = [], roots = collectQueryRoots()) {
  if (!Array.isArray(selectors) || selectors.length === 0) {
    return 0;
  }

  const elements = new Set();

  for (const selector of selectors) {
    for (const root of roots) {
      for (const element of root.querySelectorAll(selector)) {
        if (isVisibleElement(element)) {
          elements.add(element);
        }
      }
    }
  }

  return elements.size;
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
  if (!(element instanceof HTMLElement) || element.getClientRects().length === 0) {
    return false;
  }

  let current = element;

  while (current instanceof HTMLElement) {
    const style = window.getComputedStyle(current);

    if (
      current.hidden ||
      current.getAttribute("aria-hidden") === "true" ||
      style.visibility === "hidden" ||
      style.display === "none"
    ) {
      return false;
    }

    current = getComposedParentElement(current);
  }

  return true;
}

function getComposedParentElement(element) {
  if (element.parentElement) {
    return element.parentElement;
  }

  const root = element.getRootNode?.();
  return root?.host instanceof HTMLElement ? root.host : null;
}
