import assert from "node:assert/strict";
import test from "node:test";
import { getOnboardingSteps } from "../config/onboardingSteps.js";
import {
  createOnboardingStepPresentation,
  isCollectionWaitOnboardingStep,
  isInteractiveOnboardingStep,
  isPopupRequiredOnboardingStep,
  isPopupWaitOnboardingStep,
} from "../domain/onboardingInteraction.js";

const [, , mapStep, popupStep, collectionStep] = getOnboardingSteps("main");

test("waits for a Product popup before map onboarding can continue", () => {
  const waiting = createOnboardingStepPresentation(mapStep, {
    popupOpen: false,
  });
  const ready = createOnboardingStepPresentation(mapStep, {
    popupOpen: true,
  });

  assert.equal(waiting.nextDisabled, true);
  assert.equal(waiting.nextLabel, "Open a Product");
  assert.equal(waiting.focusNext, false);

  assert.equal(ready.nextDisabled, false);
  assert.equal(ready.nextLabel, "Continue");
});

test("switches Product Collection guidance from the popup action to the tray", () => {
  const waiting = createOnboardingStepPresentation(collectionStep, {
    popupOpen: true,
    collectionVisible: false,
  });
  const ready = createOnboardingStepPresentation(collectionStep, {
    popupOpen: true,
    collectionVisible: true,
  });

  assert.equal(waiting.nextDisabled, true);
  assert.equal(waiting.nextLabel, "Add to Collection");
  assert.deepEqual(waiting.step.selectors, [".popup-product-collection-btn"]);

  assert.equal(ready.nextDisabled, false);
  assert.equal(ready.nextLabel, "Next");
  assert.deepEqual(ready.step.selectors, [".pm-product-collection-tray"]);
  assert.match(ready.step.description, /Collection tray/);
});

test("classifies interactive onboarding steps", () => {
  assert.equal(isInteractiveOnboardingStep(mapStep), true);
  assert.equal(isPopupWaitOnboardingStep(mapStep), true);
  assert.equal(isPopupRequiredOnboardingStep(popupStep), true);
  assert.equal(isCollectionWaitOnboardingStep(collectionStep), true);
});
