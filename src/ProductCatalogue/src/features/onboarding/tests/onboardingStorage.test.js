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

  assert.deepEqual(readOnboardingState("main", storage), createDefaultOnboardingState("main"));
  assert.deepEqual(
    readOnboardingState("dashboard", storage),
    createDefaultOnboardingState("dashboard")
  );
});
test("bumps only the Main-map onboarding storage version", () => {
  assert.equal(getOnboardingStorageKey("main"), "pc.onboarding.main.v3");
  assert.equal(getOnboardingStorageKey("dashboard"), "pc.onboarding.dashboard.v2");
  assert.equal(getOnboardingStorageKey("analyze"), "pc.onboarding.analyze.v2");
  assert.equal(getOnboardingStorageKey("review"), "pc.onboarding.review.v2");
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
    createDefaultOnboardingState("dashboard")
  );
  assert.deepEqual(
    readOnboardingState("analyze", outdatedStorage),
    createDefaultOnboardingState("analyze")
  );
});
test("persists dismissal and completion only for the selected route", () => {
  const storage = createMemoryStorage();
  const savedState = writeOnboardingState(
    "review",
    {
      ...createDefaultOnboardingState("review"),
      dismissedWelcome: true,
      completed: true,
    },
    storage
  );

  assert.deepEqual(readOnboardingState("review", storage), savedState);
  assert.deepEqual(
    readOnboardingState("dashboard", storage),
    createDefaultOnboardingState("dashboard")
  );
});
test("does not reuse legacy Main-map completion after the FI-012 flow bump", () => {
  const storage = createMemoryStorage({
    "pc.onboarding.v1": JSON.stringify({
      version: 1,
      dismissedWelcome: true,
      completedFlows: {
        main: true,
        dashboard: true,
      },
    }),
    "pc.onboarding.main.v2": JSON.stringify({
      version: 2,
      dismissedWelcome: true,
      completed: true,
    }),
  });

  assert.deepEqual(readOnboardingState("main", storage), createDefaultOnboardingState("main"));
  assert.deepEqual(
    readOnboardingState("dashboard", storage),
    createDefaultOnboardingState("dashboard")
  );
});
