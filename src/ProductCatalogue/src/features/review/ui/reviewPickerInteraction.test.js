import assert from "node:assert/strict";
import test from "node:test";
import {
  captureReviewPickerInteraction,
  restoreReviewPickerInteraction,
} from "./reviewPickerInteraction.js";

function pickerWithInput({ value = "", inputFocused = true } = {}) {
  const input = {
    value,
    selectionStart: 2,
    selectionEnd: 4,
    focus(options) {
      input.focusOptions = options;
    },
    setSelectionRange(start, end) {
      input.selection = [start, end];
    },
  };
  const picker = { querySelector: () => input };
  const focused = inputFocused ? input : {};
  focused.closest = (selector) => (selector === ".pc-product-picker" ? picker : null);
  const page = {
    contains: (element) => element === focused,
    querySelector: (selector) => (selector === ".pc-product-picker__input" ? input : null),
  };
  return { page, input, focused };
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
