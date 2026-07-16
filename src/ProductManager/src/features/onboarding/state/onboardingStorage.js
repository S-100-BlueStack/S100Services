import { ONBOARDING_FLOW_VERSION } from "../config/onboardingSteps.js";

const LEGACY_ONBOARDING_STORAGE_KEY = "pm.onboarding.v1";
const ONBOARDING_STORAGE_PREFIX = "pm.onboarding";
const SUPPORTED_ROUTES = new Set(["main", "dashboard", "analyze", "review"]);

export function getOnboardingStorageKey(routeName) {
  return `${ONBOARDING_STORAGE_PREFIX}.${normalizeRouteName(routeName)}.v${ONBOARDING_FLOW_VERSION}`;
}

export function createDefaultOnboardingState() {
  return {
    version: ONBOARDING_FLOW_VERSION,
    dismissedWelcome: false,
    completed: false,
  };
}

export function readOnboardingState(routeName, storage = window.localStorage) {
  const normalizedRouteName = normalizeRouteName(routeName);

  try {
    const value = storage.getItem(getOnboardingStorageKey(normalizedRouteName));

    if (value) {
      return normalizeOnboardingState(JSON.parse(value));
    }

    if (normalizedRouteName === "main") {
      return readLegacyMainState(storage);
    }

    return createDefaultOnboardingState();
  } catch (error) {
    console.warn("Failed to read introduction preference.", error);
    return createDefaultOnboardingState();
  }
}

export function writeOnboardingState(routeName, state, storage = window.localStorage) {
  const normalizedState = normalizeOnboardingState(state);

  try {
    storage.setItem(getOnboardingStorageKey(routeName), JSON.stringify(normalizedState));
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
    completed: value.completed === true,
  };
}

function readLegacyMainState(storage) {
  const rawLegacyValue = storage.getItem(LEGACY_ONBOARDING_STORAGE_KEY);

  if (!rawLegacyValue) {
    return createDefaultOnboardingState();
  }

  const legacyState = JSON.parse(rawLegacyValue);

  return {
    version: ONBOARDING_FLOW_VERSION,
    dismissedWelcome: legacyState?.dismissedWelcome === true,
    completed: legacyState?.completedFlows?.main === true,
  };
}

function normalizeRouteName(routeName) {
  const normalizedRouteName = String(routeName ?? "main")
    .trim()
    .toLowerCase();

  return SUPPORTED_ROUTES.has(normalizedRouteName) ? normalizedRouteName : "main";
}
