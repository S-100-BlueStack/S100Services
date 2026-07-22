import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultOnboardingState,
  getOnboardingStorageKey,
  readOnboardingState,
  writeOnboardingState,
} from "../state/onboardingStorage.js";

function createMemoryStorage(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("returns route-specific default state when no introduction preference exists", () => {
  const storage = createMemoryStorage();

  assert.deepEqual(readOnboardingState("main", storage), createDefaultOnboardingState());
  assert.deepEqual(readOnboardingState("dashboard", storage), createDefaultOnboardingState());
});

test("uses a separate localStorage key for every route", () => {
  assert.notEqual(getOnboardingStorageKey("main"), getOnboardingStorageKey("dashboard"));
  assert.notEqual(getOnboardingStorageKey("dashboard"), getOnboardingStorageKey("analyze"));
  assert.notEqual(getOnboardingStorageKey("analyze"), getOnboardingStorageKey("review"));
});

test("returns default state for invalid JSON or an outdated version", () => {
  const invalidStorage = createMemoryStorage({
    [getOnboardingStorageKey("dashboard")]: "{",
  });
  const outdatedStorage = createMemoryStorage({
    [getOnboardingStorageKey("analyze")]: JSON.stringify({
      version: 1,
      dismissedWelcome: true,
      completed: true,
    }),
  });

  assert.deepEqual(
    readOnboardingState("dashboard", invalidStorage),
    createDefaultOnboardingState()
  );
  assert.deepEqual(readOnboardingState("analyze", outdatedStorage), createDefaultOnboardingState());
});

test("persists dismissal and completion only for the selected route", () => {
  const storage = createMemoryStorage();
  const savedState = writeOnboardingState(
    "review",
    {
      ...createDefaultOnboardingState(),
      dismissedWelcome: true,
      completed: true,
    },
    storage
  );

  assert.deepEqual(readOnboardingState("review", storage), savedState);
  assert.deepEqual(readOnboardingState("dashboard", storage), createDefaultOnboardingState());
});

test("migrates the legacy main flow without completing other routes", () => {
  const storage = createMemoryStorage({
    "pm.onboarding.v1": JSON.stringify({
      version: 1,
      dismissedWelcome: true,
      completedFlows: {
        main: true,
        dashboard: true,
      },
    }),
  });

  assert.deepEqual(readOnboardingState("main", storage), {
    ...createDefaultOnboardingState(),
    dismissedWelcome: true,
    completed: true,
  });
  assert.deepEqual(readOnboardingState("dashboard", storage), createDefaultOnboardingState());
});
