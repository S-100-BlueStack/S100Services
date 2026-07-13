import { ONBOARDING_FLOW_VERSION } from "../config/onboardingSteps.js";

export const ONBOARDING_STORAGE_KEY = "pm.onboarding.v1";

export function createDefaultOnboardingState() {
  return {
    version: ONBOARDING_FLOW_VERSION,
    dismissedWelcome: false,
    completedFlows: {},
  };
}

export function readOnboardingState(storage = window.localStorage) {
  try {
    const value = storage.getItem(ONBOARDING_STORAGE_KEY);

    if (!value) {
      return createDefaultOnboardingState();
    }

    return normalizeOnboardingState(JSON.parse(value));
  } catch (error) {
    console.warn("Failed to read introduction preference.", error);
    return createDefaultOnboardingState();
  }
}

export function writeOnboardingState(state, storage = window.localStorage) {
  const normalizedState = normalizeOnboardingState(state);

  try {
    storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(normalizedState));
  } catch (error) {
    console.warn("Failed to save introduction preference.", error);
  }

  return normalizedState;
}

export function normalizeOnboardingState(value) {
  if (value?.version !== ONBOARDING_FLOW_VERSION) {
    return createDefaultOnboardingState();
  }

  return {
    version: ONBOARDING_FLOW_VERSION,
    dismissedWelcome: value.dismissedWelcome === true,
    completedFlows: normalizeCompletedFlows(value.completedFlows),
  };
}

function normalizeCompletedFlows(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, completed]) => completed === true)
      .map(([routeName]) => [routeName, true])
  );
}
