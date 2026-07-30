import assert from "node:assert/strict";
import test from "node:test";

import {
  ONBOARDING_STEPS,
  getOnboardingSteps,
  getOnboardingWelcomeContent,
} from "../config/onboardingSteps.js";
import { calculatePopoverPosition } from "../ui/onboardingUi.js";

test("defines a compact flow for every Product Catalogue route", () => {
  assert.equal(getOnboardingSteps("main").length, 8);
  assert.equal(getOnboardingSteps("dashboard").length, 5);
  assert.equal(getOnboardingSteps("analyze").length, 4);
  assert.equal(getOnboardingSteps("review").length, 4);
  assert.deepEqual(getOnboardingSteps("unknown"), []);
});

test("defines route-specific welcome copy", () => {
  assert.equal(getOnboardingWelcomeContent("main").title, "Welcome to Product Catalogue");
  assert.equal(getOnboardingWelcomeContent("dashboard").title, "Welcome to Dashboard");
  assert.equal(getOnboardingWelcomeContent("analyze").title, "Welcome to Analyze");
  assert.equal(getOnboardingWelcomeContent("review").title, "Welcome to Product Review");
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
    assert.doesNotMatch(step.description, /backend/i);
  }
});

test("connects map selection, popup actions, Product Collection and browser preferences", () => {
  const [
    searchStep,
    filterStep,
    mapStep,
    popupStep,
    collectionStep,
    workspaceStep,
    themeStep,
    preferencesStep,
  ] = getOnboardingSteps("main");

  assert.match(searchStep.selectors[0], /input/);
  assert.equal(searchStep.placement, "adjacent-horizontal");
  assert.equal(filterStep.selectors[0], "#filter-button");
  assert.equal(mapStep.highlight, false);
  assert.equal(mapStep.selectors[0], "[data-onboarding-target='product-search']");
  assert.equal(mapStep.placement, "adjacent-left");
  assert.equal(mapStep.behavior.type, "wait-for-popup");
  assert.equal(mapStep.behavior.waitingNextLabel, "Open a Product");
  assert.equal(popupStep.placement, "adjacent-left");
  assert.deepEqual(popupStep.positionSelectors, mapStep.selectors);
  assert.equal(popupStep.selectorMode, "all");
  assert.equal(popupStep.behavior.type, "require-popup");
  assert.equal(popupStep.behavior.fallbackStepId, "main-map");
  assert.ok(popupStep.selectors.includes(".popup-copy-btn"));
  assert.ok(popupStep.selectors.includes(".popup-product-collection-btn"));
  assert.ok(popupStep.selectors.includes(".popup-action-bar"));
  assert.equal(collectionStep.placement, "adjacent-left");
  assert.deepEqual(collectionStep.positionSelectors, mapStep.selectors);
  assert.equal(collectionStep.selectors[0], ".popup-product-collection-btn");
  assert.equal(collectionStep.behavior.type, "wait-for-collection");
  assert.deepEqual(collectionStep.behavior.readySelectors, [".pc-product-collection-tray"]);
  assert.equal(collectionStep.selectors.includes("[data-nav-analyze-link]"), false);
  assert.equal(workspaceStep.selectorMode, "all");
  assert.deepEqual(workspaceStep.selectors, [
    "[data-nav-dashboard-link]",
    "[data-nav-analyze-link]",
    "[data-nav-review-link]",
  ]);
  assert.deepEqual(themeStep.selectors, ["#theme-toggle"]);
  assert.deepEqual(preferencesStep.selectors, ["#preferences-button"]);
  assert.equal(preferencesStep.behavior.type, "wait-for-target-count");
  assert.deepEqual(preferencesStep.behavior.selectors, ["#preferences-panel:not([hidden])"]);
  assert.deepEqual(preferencesStep.behavior.readySelectors, ["#preferences-panel"]);
  assert.equal(preferencesStep.behavior.autoAdvance, false);
  assert.equal(preferencesStep.behavior.readyNextLabel, "Finish");
});

test("covers the primary Dashboard workflow without route navigation", () => {
  const steps = getOnboardingSteps("dashboard");

  assert.deepEqual(
    steps.map((step) => step.id),
    [
      "dashboard-range",
      "dashboard-summary",
      "dashboard-filters",
      "dashboard-activity-links",
      "dashboard-breakdowns",
    ]
  );
  assert.equal(steps[0].selectors[0], ".pc-dashboard-range-builder");
  assert.equal(steps[2].selectors[0], ".pc-dashboard-filters");
  assert.equal(steps[3].selectors[0], ".pc-dashboard-activity-links");
  assert.equal(steps[4].selectors[0], ".pc-dashboard-grid__aside");
  assert.ok(steps.every((step) => !step.behavior));
});

test("requires an Analyze Product and keeps guidance beside the sidebar", () => {
  const steps = getOnboardingSteps("analyze");

  assert.deepEqual(
    steps.map((step) => step.id),
    [
      "analyze-product-picker",
      "analyze-product-list",
      "analyze-product-cards",
      "analyze-reports-history",
    ]
  );
  assert.ok(steps.every((step) => step.placement === "adjacent-horizontal"));
  assert.equal(steps[0].behavior.type, "wait-for-target-count");
  assert.equal(steps[0].behavior.minimumCount, 1);
  assert.deepEqual(steps[0].behavior.selectors, [".analyze-product-card"]);
  assert.equal(steps[2].behavior.type, "require-target-count");
  assert.equal(steps[3].behavior.type, "require-target-count");
});

test("requires two Review Products and highlights two columns", () => {
  const steps = getOnboardingSteps("review");

  assert.deepEqual(
    steps.map((step) => step.id),
    [
      "review-product-picker",
      "review-product-list",
      "review-comparison-board",
      "review-product-content",
    ]
  );
  assert.equal(steps[0].placement, "adjacent-horizontal");
  assert.equal(steps[0].behavior.type, "wait-for-target-count");
  assert.equal(steps[0].behavior.minimumCount, 2);
  assert.deepEqual(steps[0].behavior.selectors, [".pc-review-column"]);
  assert.equal(steps[2].selectors[0], ".pc-review-column");
  assert.equal(steps[2].selectorMode, "all");
  assert.equal(steps[2].maximumTargets, 2);
  assert.equal(steps[2].placement, "target-top-right");
  assert.equal(steps[2].behavior.type, "require-target-count");
});

test("keeps map, popup and collection guidance anchored to Product search", () => {
  const [, , mapStep, popupStep, collectionStep] = getOnboardingSteps("main");

  assert.equal(mapStep.placement, "adjacent-left");
  assert.equal(popupStep.placement, mapStep.placement);
  assert.equal(collectionStep.placement, mapStep.placement);
  assert.deepEqual(popupStep.positionSelectors, mapStep.selectors);
  assert.deepEqual(collectionStep.positionSelectors, mapStep.selectors);
});

test("places map guidance to the upper left of Product search", () => {
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
    placement: "adjacent-left",
    viewportWidth: 1728,
    viewportHeight: 900,
    minimumTop: 68,
  });

  assert.deepEqual(position, {
    centered: false,
    top: 68,
    left: 288,
  });
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

test("uses the left side when an adjacent card has no room on the right", () => {
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

test("places Review guidance inside the top-right of the highlighted columns", () => {
  const position = calculatePopoverPosition({
    popoverRect: { width: 340, height: 190 },
    targetRect: {
      left: 330,
      top: 70,
      right: 1140,
      bottom: 820,
      width: 810,
      height: 750,
    },
    placement: "target-top-right",
    viewportWidth: 1440,
    viewportHeight: 900,
    minimumTop: 62,
  });

  assert.deepEqual(position, {
    centered: false,
    top: 82,
    left: 788,
  });
});
