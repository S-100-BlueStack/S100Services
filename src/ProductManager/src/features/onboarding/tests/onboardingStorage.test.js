import assert from "node:assert/strict";
import test from "node:test";
import {
  ONBOARDING_STORAGE_KEY,
  createDefaultOnboardingState,
  readOnboardingState,
  writeOnboardingState,
} from "../state/onboardingStorage.js";

function createMemoryStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set(ONBOARDING_STORAGE_KEY, initialValue);
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("returns default state when no introduction preference exists", () => {
  assert.deepEqual(readOnboardingState(createMemoryStorage()), createDefaultOnboardingState());
});

test("returns default state for invalid JSON or an outdated version", () => {
  assert.deepEqual(readOnboardingState(createMemoryStorage("{")), createDefaultOnboardingState());
  assert.deepEqual(
    readOnboardingState(
      createMemoryStorage(JSON.stringify({ version: 0, dismissedWelcome: true }))
    ),
    createDefaultOnboardingState()
  );
});

test("persists dismissal and completed route flows", () => {
  const storage = createMemoryStorage();
  const savedState = writeOnboardingState(
    {
      ...createDefaultOnboardingState(),
      dismissedWelcome: true,
      completedFlows: { main: true, dashboard: false },
    },
    storage
  );

  assert.deepEqual(savedState.completedFlows, { main: true });
  assert.deepEqual(readOnboardingState(storage), savedState);
});
