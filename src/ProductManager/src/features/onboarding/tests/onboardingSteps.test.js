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
    assert.ok(step.selectors.length > 0);
    assert.equal(typeof step.placement, "string");
  }
});

test("keeps the connected map workflow aligned and targets concrete controls", () => {
  const [searchStep, filterStep, mapStep, popupStep, collectionStep, workspaceStep] =
    getOnboardingSteps("main");

  assert.match(searchStep.selectors[0], /input/);
  assert.equal(searchStep.placement, "adjacent-horizontal");
  assert.ok(searchStep.activeSurfaceSelectors.length > 0);

  assert.equal(filterStep.selectors[0], ".filter-wrapper");
  assert.deepEqual(filterStep.activeSurfaceSelectors, [".filter-wrapper"]);

  assert.equal(mapStep.highlight, false);
  assert.equal(mapStep.placement, "left-center");
  assert.equal(popupStep.placement, "left-center");
  assert.equal(collectionStep.placement, "left-center");

  assert.equal(popupStep.selectorMode, "all");
  assert.match(collectionStep.selectors[0], /product-collection/);
  assert.equal(collectionStep.selectors.includes("[data-nav-analyze-link]"), false);

  assert.equal(workspaceStep.selectors[0], "#header .header-center");
  assert.deepEqual(workspaceStep.activeSurfaceSelectors, ["#header .header-center"]);
});
