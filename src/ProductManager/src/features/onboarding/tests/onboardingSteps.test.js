import assert from "node:assert/strict";
import test from "node:test";
import { ONBOARDING_STEPS, getOnboardingSteps } from "../config/onboardingSteps.js";

test("defines a compact flow for every Product Manager route", () => {
  assert.equal(getOnboardingSteps("main").length, 6);
  assert.equal(getOnboardingSteps("dashboard").length, 1);
  assert.equal(getOnboardingSteps("analyze").length, 1);
  assert.equal(getOnboardingSteps("review").length, 1);
  assert.deepEqual(getOnboardingSteps("unknown"), []);
});

test("uses unique step identifiers and complete user-facing copy", () => {
  const steps = Object.values(ONBOARDING_STEPS).flat();
  const ids = steps.map((step) => step.id);

  assert.equal(new Set(ids).size, ids.length);

  for (const step of steps) {
    assert.ok(step.title.trim());
    assert.ok(step.description.trim());
    assert.ok(Array.isArray(step.selectors));
  }
});
