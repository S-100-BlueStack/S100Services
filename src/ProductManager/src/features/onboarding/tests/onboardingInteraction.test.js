import assert from "node:assert/strict";
import test from "node:test";

import { getOnboardingSteps } from "../config/onboardingSteps.js";
import {
  createOnboardingStepPresentation,
  isCollectionWaitOnboardingStep,
  isInteractiveOnboardingStep,
  isPopupRequiredOnboardingStep,
  isPopupWaitOnboardingStep,
  isTargetCountRequiredOnboardingStep,
  isTargetCountRequirementMet,
  isTargetCountWaitOnboardingStep,
} from "../domain/onboardingInteraction.js";

const [, , mapStep, popupStep, collectionStep, , , preferencesStep] = getOnboardingSteps("main");
const [analyzePickerStep, , analyzeCardsStep] = getOnboardingSteps("analyze");
const [reviewPickerStep, , reviewBoardStep] = getOnboardingSteps("review");

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

test("waits for one Analyze Product before continuing", () => {
  const waiting = createOnboardingStepPresentation(analyzePickerStep, {
    targetCount: 0,
  });
  const ready = createOnboardingStepPresentation(analyzePickerStep, {
    targetCount: 1,
  });

  assert.equal(waiting.nextDisabled, true);
  assert.equal(waiting.nextLabel, "Add a Product");
  assert.equal(ready.nextDisabled, false);
  assert.equal(ready.nextLabel, "Continue");
  assert.equal(isTargetCountRequirementMet(analyzePickerStep, 1), true);
});

test("waits for two Review Product columns before continuing", () => {
  const waiting = createOnboardingStepPresentation(reviewPickerStep, {
    targetCount: 1,
  });
  const ready = createOnboardingStepPresentation(reviewPickerStep, {
    targetCount: 2,
  });

  assert.equal(waiting.nextDisabled, true);
  assert.equal(waiting.nextLabel, "Add two Products");
  assert.equal(ready.nextDisabled, false);
  assert.equal(isTargetCountRequirementMet(reviewPickerStep, 1), false);
  assert.equal(isTargetCountRequirementMet(reviewPickerStep, 2), true);
});

test("moves final guidance from the Preferences button to the open panel", () => {
  const waiting = createOnboardingStepPresentation(preferencesStep, {
    targetCount: 0,
  });
  const ready = createOnboardingStepPresentation(preferencesStep, {
    targetCount: 1,
  });

  assert.equal(waiting.nextDisabled, true);
  assert.equal(waiting.nextLabel, "Open Preferences");
  assert.deepEqual(waiting.step.selectors, ["#preferences-button"]);
  assert.equal(ready.nextDisabled, false);
  assert.equal(ready.nextLabel, "Finish");
  assert.deepEqual(ready.step.selectors, ["#preferences-panel"]);
  assert.equal(ready.step.placement, "left");
  assert.match(ready.step.description, /restart the introduction/i);
});

test("classifies interactive onboarding steps", () => {
  assert.equal(isInteractiveOnboardingStep(mapStep), true);
  assert.equal(isPopupWaitOnboardingStep(mapStep), true);
  assert.equal(isPopupRequiredOnboardingStep(popupStep), true);
  assert.equal(isCollectionWaitOnboardingStep(collectionStep), true);
  assert.equal(isTargetCountWaitOnboardingStep(analyzePickerStep), true);
  assert.equal(isTargetCountRequiredOnboardingStep(analyzeCardsStep), true);
  assert.equal(isTargetCountWaitOnboardingStep(reviewPickerStep), true);
  assert.equal(isTargetCountRequiredOnboardingStep(reviewBoardStep), true);
  assert.equal(isTargetCountWaitOnboardingStep(preferencesStep), true);
});
