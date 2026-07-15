const INTERACTION_TYPE = Object.freeze({
  WAIT_FOR_POPUP: "wait-for-popup",
  REQUIRE_POPUP: "require-popup",
  WAIT_FOR_COLLECTION: "wait-for-collection",
});

export function createOnboardingStepPresentation(
  step,
  { popupOpen = false, collectionVisible = false } = {}
) {
  const behavior = step?.behavior;

  if (!behavior) {
    return createDefaultPresentation(step);
  }

  switch (behavior.type) {
    case INTERACTION_TYPE.WAIT_FOR_POPUP:
      return {
        ...createDefaultPresentation(step),
        nextDisabled: !popupOpen,
        nextLabel: popupOpen
          ? behavior.readyNextLabel || "Continue"
          : behavior.waitingNextLabel || "Open a Product",
        nextTitle: popupOpen
          ? null
          : behavior.waitingNextTitle || "Select a Product on the map to continue.",
        focusNext: popupOpen,
      };

    case INTERACTION_TYPE.REQUIRE_POPUP:
      return createDefaultPresentation(step);

    case INTERACTION_TYPE.WAIT_FOR_COLLECTION:
      if (collectionVisible) {
        return {
          ...createDefaultPresentation({
            ...step,
            description: behavior.readyDescription || step.description,
            selectors: behavior.readySelectors || step.selectors,
            selectorMode: behavior.readySelectorMode,
          }),
          nextLabel: behavior.readyNextLabel || "Next",
        };
      }

      return {
        ...createDefaultPresentation(step),
        nextDisabled: true,
        nextLabel: behavior.waitingNextLabel || "Add to Collection",
        nextTitle: behavior.waitingNextTitle || "Add a Product to the Collection to continue.",
        focusNext: false,
      };

    default:
      return createDefaultPresentation(step);
  }
}

export function isInteractiveOnboardingStep(step) {
  return Boolean(step?.behavior?.type);
}

export function isPopupRequiredOnboardingStep(step) {
  return step?.behavior?.type === INTERACTION_TYPE.REQUIRE_POPUP;
}

export function isPopupWaitOnboardingStep(step) {
  return step?.behavior?.type === INTERACTION_TYPE.WAIT_FOR_POPUP;
}

export function isCollectionWaitOnboardingStep(step) {
  return step?.behavior?.type === INTERACTION_TYPE.WAIT_FOR_COLLECTION;
}

function createDefaultPresentation(step) {
  return {
    step,
    nextDisabled: false,
    nextLabel: null,
    nextTitle: null,
    focusNext: true,
  };
}
