import {
  resolveOnboardingTarget,
  isVisibleOnboardingElement,
  getOnboardingStepRequirement,
  isProductPopupOpen,
  resolveOnboardingHighlights,
  resolveOnboardingPopupTarget,
} from "../domain/onboardingInteraction.js";
import { getOnboardingSteps, getOnboardingWelcomeContent } from "../config/onboardingSteps.js";
import { readOnboardingState, writeOnboardingState } from "../state/onboardingStorage.js";
import { createTourPopover, createWelcomeDialog } from "../ui/onboardingUi.js";

const TARGET_REFRESH_INTERVAL_MS = 150;
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
  const steps = getOnboardingSteps(routeName);
  let state = readOnboardingState(routeName);
  let routeReady = false;
  let welcomeOffered = false;
  let destroyed = false;
  let generation = 0;
  let welcomeDialog = null;
  let tour = null;
  let currentStepIndex = -1;
  let previousFocus = null;
  let refreshInterval = null;
  let refreshFrame = null;
  let activeReveal = null;
  let mapView = null;
  let getPopupCollectionButton = null;
  let pendingAdvanceIndex = -1;

  function restoreFocus() {
    const target = isVisibleOnboardingElement(previousFocus)
      ? previousFocus
      : document.getElementById("preferences-button");
    if (!isVisibleOnboardingElement(target)) return;
    if (typeof target.setFocus === "function") void target.setFocus();
    else target.focus({ preventScroll: true });
  }

  function closeActiveUi({ returnFocus = true } = {}) {
    generation += 1;
    const hadUi = Boolean(tour || welcomeDialog);
    releaseActiveReveal();
    welcomeDialog?.close({ restoreFocus: false });
    welcomeDialog = null;
    tour?.remove();
    tour = null;
    currentStepIndex = -1;
    pendingAdvanceIndex = -1;
    if (refreshInterval !== null) window.clearInterval(refreshInterval);
    if (refreshFrame !== null) window.cancelAnimationFrame(refreshFrame);
    refreshInterval = null;
    refreshFrame = null;
    if (hadUi && returnFocus) restoreFocus();
  }

  function completeCurrentFlow() {
    state = writeOnboardingState(routeName, { ...state, completed: true });
    closeActiveUi();
  }

  function prepareStepReveal(step) {
    const reveal = step?.reveal;
    if (!sameReveal(activeReveal, reveal)) {
      releaseActiveReveal();
    }

    if (!reveal) return;

    const openTarget = document.querySelector(reveal.openSelector);
    if (isVisibleOnboardingElement(openTarget)) {
      if (!activeReveal) activeReveal = { ...reveal, openedByOnboarding: false };
      return;
    }

    const trigger = document.querySelector(reveal.triggerSelector);
    if (!isVisibleOnboardingElement(trigger) || typeof trigger.click !== "function") return;

    trigger.click();
    const openedTarget = document.querySelector(reveal.openSelector);
    if (isVisibleOnboardingElement(openedTarget)) {
      activeReveal = { ...reveal, openedByOnboarding: true };
    }
  }

  function releaseActiveReveal() {
    const reveal = activeReveal;
    activeReveal = null;
    if (!reveal?.openedByOnboarding) return;

    const openTarget = document.querySelector(reveal.openSelector);
    if (!isVisibleOnboardingElement(openTarget)) return;

    const trigger = document.querySelector(reveal.triggerSelector);
    if (!isVisibleOnboardingElement(trigger) || typeof trigger.click !== "function") return;
    trigger.click();
  }

  function sameReveal(active, reveal) {
    return Boolean(
      active &&
      reveal &&
      active.triggerSelector === reveal.triggerSelector &&
      active.openSelector === reveal.openSelector
    );
  }

  function findStepTarget(step, { reveal = false } = {}) {
    if (step.popupAnchor && isProductPopupOpen(mapView)) {
      const collectionButton = getPopupCollectionButton?.();
      return (
        resolveOnboardingPopupTarget(step, mapView, { collectionButton }) ??
        resolveOnboardingPopupTarget({ popupAnchor: "popup" }, mapView) ??
        resolveOnboardingTarget(step, { reveal })
      );
    }
    return resolveOnboardingTarget(step, { reveal });
  }

  function findPositionTarget(step, target) {
    // The card stays beside the popup or panel, while highlights can follow
    // small, independently rendered controls inside the same surface.
    if (step.popupAnchor && step.popupAnchor !== "popup") {
      return resolveOnboardingPopupTarget({ popupAnchor: "popup" }, mapView) ?? target;
    }
    if (step.placement !== "left" || !step.reveal?.openSelector) return target;
    const panel = document.querySelector(step.reveal.openSelector);
    return isVisibleOnboardingElement(panel) ? panel : target;
  }

  function showStep(index, direction = 1, { focusNext = true } = {}) {
    if (destroyed || !tour) return;
    // Resolve against the current application DOM; optional controls can disappear
    // during refresh or responsive layout changes without blocking the tour.
    for (let next = index; next >= 0 && next < steps.length; next += direction) {
      prepareStepReveal(steps[next]);
      const step = steps[next];
      const target = findStepTarget(step, { reveal: true });
      if (!target) continue;
      currentStepIndex = next;
      const requirement = getOnboardingStepRequirement(step, { mapView });
      // Advance only after a user satisfies a requirement that was initially
      // missing. Already-populated routes remain readable and Back stays usable.
      pendingAdvanceIndex = step.advanceOnReady && !requirement.ready ? next : -1;
      tour.render({
        step,
        index: next,
        count: steps.length,
        targets: resolveOnboardingHighlights(step, target),
        positionTargets: [findPositionTarget(step, target)],
        nextDisabled: !requirement.ready,
        requirementMessage: requirement.message,
        focusNext,
      });
      return;
    }
    if (direction > 0) completeCurrentFlow();
  }

  function refreshTargets() {
    if (destroyed || !tour || currentStepIndex < 0) return;
    const step = steps[currentStepIndex];
    // Product-dependent steps must not silently advance when their Product is
    // removed or the popup closes. Return to the step where it can be selected.
    if (
      routeName === "main" &&
      currentStepIndex > steps.findIndex((value) => value.id === "main-map") &&
      step.requires === "main-product-popup" &&
      !isProductPopupOpen(mapView)
    ) {
      showStep(
        steps.findIndex((value) => value.id === "main-map"),
        1,
        { focusNext: false }
      );
      return;
    }
    if (
      (routeName === "analyze" || routeName === "review") &&
      currentStepIndex > 1 &&
      !getOnboardingStepRequirement(steps[1], { mapView }).ready
    ) {
      showStep(1, 1, { focusNext: false });
      return;
    }
    const target = findStepTarget(step);
    if (!target) {
      showStep(currentStepIndex + 1, 1, {
        focusNext: tour.containsFocus() || !document.activeElement?.isConnected,
      });
      return;
    }
    const requirement = getOnboardingStepRequirement(step, { mapView });
    if (pendingAdvanceIndex === currentStepIndex && requirement.ready) {
      pendingAdvanceIndex = -1;
      showStep(currentStepIndex + 1, 1, {
        focusNext: tour.containsFocus() || !document.activeElement?.isConnected,
      });
      return;
    }
    tour.updateNext({ nextDisabled: !requirement.ready, requirementMessage: requirement.message });
    tour.reposition(resolveOnboardingHighlights(step, target), step, [
      findPositionTarget(step, target),
    ]);
  }

  function scheduleTargetRefresh() {
    if (!tour || destroyed || refreshFrame !== null) return;
    const token = generation;
    refreshFrame = window.requestAnimationFrame(() => {
      if (destroyed || token !== generation) return;
      refreshFrame = null;
      refreshTargets();
    });
  }

  function startCurrentRoute({ manual = true } = {}) {
    if (destroyed || !routeReady || steps.length === 0) return false;
    // Re-entry keeps the original trigger, not a button in the removed tour.
    const origin = tour || welcomeDialog ? previousFocus : document.activeElement;
    closeActiveUi({ returnFocus: false });
    previousFocus = origin;
    const token = generation;
    const whenCurrent = (callback) => () => {
      if (!destroyed && token === generation && tour) callback();
    };
    tour = createTourPopover({
      onBack: whenCurrent(() => showStep(currentStepIndex - 1, -1)),
      onNext: whenCurrent(() => {
        // Recheck at activation time because the popup can close between refresh ticks.
        if (!getOnboardingStepRequirement(steps[currentStepIndex], { mapView }).ready) {
          refreshTargets();
          return;
        }
        showStep(currentStepIndex + 1);
      }),
      onRequestClose: whenCurrent(() => closeActiveUi()),
    });
    showStep(0);
    if (tour) {
      refreshInterval = window.setInterval(
        whenCurrent(scheduleTargetRefresh),
        TARGET_REFRESH_INTERVAL_MS
      );
    }
    return manual;
  }

  function setRouteReady() {
    if (destroyed) return;
    routeReady = true;
    if (welcomeOffered || state.dismissedWelcome || state.completed || steps.length === 0) return;
    welcomeOffered = true;
    previousFocus = document.activeElement;
    const token = generation;
    const whenCurrent = (callback) => () => {
      if (!destroyed && token === generation && welcomeDialog) callback();
    };
    welcomeDialog = createWelcomeDialog({
      ...getOnboardingWelcomeContent(routeName),
      onStart: whenCurrent(() => startCurrentRoute({ manual: false })),
      onNotNow: whenCurrent(() => closeActiveUi()),
      onDismiss: whenCurrent(() => {
        state = writeOnboardingState(routeName, { ...state, dismissedWelcome: true });
        closeActiveUi();
      }),
    });
  }

  function handleKeydown(event) {
    if (event.key !== "Escape" || event.defaultPrevented || (!tour && !welcomeDialog)) return;
    event.preventDefault();
    closeActiveUi();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    mapView = null;
    getPopupCollectionButton = null;
    closeActiveUi({ returnFocus: false });
    document.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("resize", scheduleTargetRefresh);
    window.removeEventListener("scroll", scheduleTargetRefresh, true);
    window.removeEventListener("pagehide", destroy);
    window.removeEventListener("popstate", destroy);
    if (activeService === service) activeService = null;
  }

  // Bubble-phase Escape respects controls that already handled the key.
  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("resize", scheduleTargetRefresh);
  window.addEventListener("scroll", scheduleTargetRefresh, true);
  window.addEventListener("pagehide", destroy);
  window.addEventListener("popstate", destroy);
  const service = {
    setRouteReady,
    startCurrentRoute,
    setMapView(view, { resolvePopupCollectionButton = null } = {}) {
      mapView = view;
      getPopupCollectionButton =
        typeof resolvePopupCollectionButton === "function" ? resolvePopupCollectionButton : null;
      scheduleTargetRefresh();
    },
    destroy,
  };
  return service;
}
