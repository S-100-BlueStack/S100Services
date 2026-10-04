import { ONBOARDING_FLOW_VERSION, getOnboardingFlowVersion } from "../config/onboardingSteps.js";

const LEGACY_ONBOARDING_STORAGE_KEY = "pc.onboarding.v1";
const ONBOARDING_STORAGE_PREFIX = "pc.onboarding";
const SUPPORTED_ROUTES = new Set(["main", "dashboard", "analyze", "review"]);

export function getOnboardingStorageKey(routeName) {
  const normalizedRouteName = normalizeRouteName(routeName);
  return `${ONBOARDING_STORAGE_PREFIX}.${normalizedRouteName}.v${getOnboardingFlowVersion(
    normalizedRouteName
  )}`;
}
export function createDefaultOnboardingState(routeName = "main") {
  return {
    version: getOnboardingFlowVersion(normalizeRouteName(routeName)),
    dismissedWelcome: false,
    completed: false,
  };
}

export function readOnboardingState(routeName, storage = window.localStorage) {
  const normalizedRouteName = normalizeRouteName(routeName);

  try {
    const value = storage.getItem(getOnboardingStorageKey(normalizedRouteName));

    if (value) {
      return normalizeOnboardingState(JSON.parse(value), normalizedRouteName);
    }
    if (
      normalizedRouteName === "main" &&
      getOnboardingFlowVersion(normalizedRouteName) === ONBOARDING_FLOW_VERSION
    ) {
      return readLegacyMainState(storage);
    }

    return createDefaultOnboardingState(normalizedRouteName);
  } catch (error) {
    console.warn("Failed to read introduction preference.", error);
    return createDefaultOnboardingState(normalizedRouteName);
  }
}

export function writeOnboardingState(routeName, state, storage = window.localStorage) {
  const normalizedRouteName = normalizeRouteName(routeName);
  const normalizedState = normalizeOnboardingState(state, normalizedRouteName);
  try {
    storage.setItem(getOnboardingStorageKey(normalizedRouteName), JSON.stringify(normalizedState));
  } catch (error) {
    console.warn("Failed to save introduction preference.", error);
  }

  return normalizedState;
}

export function normalizeOnboardingState(value, routeName = "main") {
  const normalizedRouteName = normalizeRouteName(routeName);
  const version = getOnboardingFlowVersion(normalizedRouteName);
  if (value?.version !== version) {
    return createDefaultOnboardingState(normalizedRouteName);
  }
  return {
    version,
    dismissedWelcome: value.dismissedWelcome === true,
    completed: value.completed === true,
  };
}

function readLegacyMainState(storage) {
  const rawLegacyValue = storage.getItem(LEGACY_ONBOARDING_STORAGE_KEY);

  if (!rawLegacyValue) {
    return createDefaultOnboardingState("main");
  }

  const legacyState = JSON.parse(rawLegacyValue);
  return {
    version: getOnboardingFlowVersion("main"),
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
