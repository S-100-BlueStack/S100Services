const INTERACTION_TYPE = Object.freeze({
  WAIT_FOR_POPUP: "wait-for-popup",
  REQUIRE_POPUP: "require-popup",
  WAIT_FOR_COLLECTION: "wait-for-collection",
  WAIT_FOR_TARGET_COUNT: "wait-for-target-count",
  REQUIRE_TARGET_COUNT: "require-target-count",
});

export function createOnboardingStepPresentation(
  step,
  { popupOpen = false, collectionVisible = false, targetCount = 0 } = {}
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
    case INTERACTION_TYPE.REQUIRE_TARGET_COUNT:
      return createDefaultPresentation(step);

    case INTERACTION_TYPE.WAIT_FOR_COLLECTION:
      if (collectionVisible) {
        return {
          ...createDefaultPresentation(
            createReadyStep(step, behavior, {
              defaultDescription: step.description,
              defaultSelectors: step.selectors,
            })
          ),
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

    case INTERACTION_TYPE.WAIT_FOR_TARGET_COUNT: {
      const requirementMet = isTargetCountRequirementMet(step, targetCount);
      const presentationStep = requirementMet
        ? createReadyStep(step, behavior, {
            defaultDescription: step.description,
            defaultSelectors: step.selectors,
          })
        : step;

      return {
        ...createDefaultPresentation(presentationStep),
        nextDisabled: !requirementMet,
        nextLabel: requirementMet
          ? behavior.readyNextLabel || "Continue"
          : behavior.waitingNextLabel || "Continue",
        nextTitle: requirementMet ? null : behavior.waitingNextTitle || null,
        focusNext: requirementMet,
      };
    }

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

export function isTargetCountWaitOnboardingStep(step) {
  return step?.behavior?.type === INTERACTION_TYPE.WAIT_FOR_TARGET_COUNT;
}

export function isTargetCountRequiredOnboardingStep(step) {
  return step?.behavior?.type === INTERACTION_TYPE.REQUIRE_TARGET_COUNT;
}

export function isTargetCountRequirementMet(step, targetCount) {
  const minimumCount = Math.max(1, Number(step?.behavior?.minimumCount) || 1);
  return Number(targetCount) >= minimumCount;
}

function createReadyStep(step, behavior, { defaultDescription, defaultSelectors }) {
  return {
    ...step,
    description: behavior.readyDescription || defaultDescription,
    selectors: behavior.readySelectors || defaultSelectors,
    selectorMode: behavior.readySelectorMode ?? step.selectorMode,
    placement: behavior.readyPlacement || step.placement,
  };
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
