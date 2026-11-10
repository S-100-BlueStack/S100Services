import assert from "node:assert/strict";
import test from "node:test";
import {
  captureReviewPickerInteraction,
  restoreReviewPickerInteraction,
} from "./reviewPickerInteraction.js";

function pickerWithInput({ value = "", inputFocused = true, committed = false } = {}) {
  const results = { hidden: false };
  const input = {
    dataset: {},
    attributes: {},
    value,
    selectionStart: 2,
    selectionEnd: 4,
    focus(options) {
      input.focusOptions = options;
    },
    setSelectionRange(start, end) {
      input.selection = [start, end];
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    closest(selector) {
      return selector === ".pc-product-picker" ? picker : null;
    },
  };
  const picker = {
    dataset: committed ? { productPickerCommitted: "true" } : {},
    querySelector: (selector) => (selector === ".pc-product-picker__results" ? results : input),
  };
  const focused = inputFocused ? input : {};
  focused.closest = (selector) => (selector === ".pc-product-picker" ? picker : null);
  const page = {
    contains: (element) => element === focused,
    querySelector: (selector) => (selector === ".pc-product-picker__input" ? input : null),
  };
  return { page, input, focused, picker, results };
}

test("Review preserves newer focused picker typing and caret across a synchronous rerender", () => {
  const prior = pickerWithInput({ value: "Aalborg" });
  const interaction = captureReviewPickerInteraction(prior.page, prior.focused);
  const next = pickerWithInput({ value: "" });
  restoreReviewPickerInteraction(next.page, interaction);
  assert.equal(next.input.value, "Aalborg");
  assert.deepEqual(next.input.focusOptions, { preventScroll: true });
  assert.deepEqual(next.input.selection, [2, 4]);
});

test("Review does not steal focus or restore a stale draft from outside the picker", () => {
  const prior = pickerWithInput({ value: "stale" });
  assert.equal(captureReviewPickerInteraction(prior.page, {}), null);
  const next = pickerWithInput();
  restoreReviewPickerInteraction(next.page, null);
  assert.equal(next.input.focusOptions, undefined);
  assert.equal(next.input.value, "");
});

test("Review suggestion activation restores keyboard focus without resurrecting its old query", () => {
  const prior = pickerWithInput({ value: "previous", inputFocused: false });
  const interaction = captureReviewPickerInteraction(prior.page, prior.focused);
  const next = pickerWithInput({ value: "" });
  restoreReviewPickerInteraction(next.page, interaction);
  assert.equal(next.input.value, "");
  assert.deepEqual(next.input.focusOptions, { preventScroll: true });
});

test("Review does not focus a removed picker when the replacement is unavailable", () => {
  const prior = pickerWithInput({ value: "new text" });
  const interaction = captureReviewPickerInteraction(prior.page, prior.focused);
  restoreReviewPickerInteraction({ querySelector: () => null }, interaction);
  assert.equal(prior.input.value, "new text");
});

test("Review selection keeps the replacement input focused with a closed dropdown across rerenders", () => {
  const prior = pickerWithInput({ value: "PRIMARY", committed: true });
  const interaction = captureReviewPickerInteraction(prior.page, prior.focused);
  assert.equal(interaction.committed, true);
  assert.equal(interaction.draft, null);

  const afterAdd = pickerWithInput();
  restoreReviewPickerInteraction(afterAdd.page, interaction);
  assert.equal(afterAdd.input.dataset.productPickerSuppressResults, "true");
  assert.equal(afterAdd.input.attributes["aria-expanded"], "false");
  assert.equal(afterAdd.results.hidden, true);
  assert.deepEqual(afterAdd.input.focusOptions, { preventScroll: true });

  const subsequentInteraction = captureReviewPickerInteraction(afterAdd.page, afterAdd.focused);
  const afterStatusLoad = pickerWithInput();
  restoreReviewPickerInteraction(afterStatusLoad.page, subsequentInteraction);
  assert.equal(afterStatusLoad.input.dataset.productPickerSuppressResults, "true");
  assert.equal(afterStatusLoad.results.hidden, true);
});
