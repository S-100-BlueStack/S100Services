import assert from "node:assert/strict";
import test from "node:test";
import { ONBOARDING_STEPS, getOnboardingSteps } from "../config/onboardingSteps.js";
import { calculatePopoverPosition } from "../ui/onboardingUi.js";

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
    assert.equal("activeSurfaceSelectors" in step, false);
  }
});

test("targets stable main-map controls without changing their stacking context", () => {
  const [searchStep, filterStep, mapStep, popupStep, collectionStep, workspaceStep] =
    getOnboardingSteps("main");

  assert.match(searchStep.selectors[0], /input/);
  assert.equal(searchStep.placement, "adjacent-horizontal");

  assert.equal(filterStep.selectors[0], "#filter-button");

  assert.equal(mapStep.highlight, false);
  assert.equal(mapStep.placement, "left-center");
  assert.equal(popupStep.placement, "left-center");
  assert.equal(collectionStep.placement, "left-center");

  assert.equal(popupStep.selectorMode, "all");
  assert.ok(popupStep.selectors.includes(".popup-copy-btn"));
  assert.ok(popupStep.selectors.includes(".popup-product-collection-btn"));
  assert.ok(popupStep.selectors.includes(".popup-action-bar"));

  assert.equal(collectionStep.selectors[0], ".popup-product-collection-btn");
  assert.equal(collectionStep.selectors.includes("[data-nav-analyze-link]"), false);

  assert.equal(workspaceStep.selectorMode, "all");
  assert.deepEqual(workspaceStep.selectors, [
    "[data-nav-dashboard-link]",
    "[data-nav-analyze-link]",
    "[data-nav-review-link]",
  ]);
});

test("keeps an adjacent Product search card on the right when horizontal space exists", () => {
  const position = calculatePopoverPosition({
    popoverRect: { width: 340, height: 190 },
    targetRect: {
      left: 640,
      top: 60,
      right: 1080,
      bottom: 100,
      width: 440,
      height: 40,
    },
    placement: "adjacent-horizontal",
    viewportWidth: 1728,
    viewportHeight: 900,
    minimumTop: 68,
  });

  assert.deepEqual(position, {
    centered: false,
    top: 68,
    left: 1092,
  });
});

test("uses the left side when Product search has no room on the right", () => {
  const position = calculatePopoverPosition({
    popoverRect: { width: 340, height: 190 },
    targetRect: {
      left: 1120,
      top: 60,
      right: 1600,
      bottom: 100,
      width: 480,
      height: 40,
    },
    placement: "adjacent-horizontal",
    viewportWidth: 1728,
    viewportHeight: 900,
    minimumTop: 68,
  });

  assert.deepEqual(position, {
    centered: false,
    top: 68,
    left: 768,
  });
});
