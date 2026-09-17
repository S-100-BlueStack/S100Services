import assert from "node:assert/strict";
import test from "node:test";
import {
  captureReviewProductListInteraction,
  restoreReviewProductListInteraction,
} from "./reviewProductListInteraction.js";

const CONTENT_TYPES = ["history", "ic-enc-reports", "internal-validation-reports"];

test("Review content toggles preserve Product-list scroll and focus", () => {
  for (const contentType of CONTENT_TYPES) {
    const original = createHarness({ contentType, scrollTop: 680 });
    const interaction = captureReviewProductListInteraction({
      page: original.page,
      activeElement: original.toggle,
    });
    const replacement = createHarness({ contentType, scrollTop: 0 });

    restoreReviewProductListInteraction(interaction, { page: replacement.page });

    assert.equal(replacement.list.scrollTop, 680);
    assert.equal(replacement.toggle.focusCount, 1);
    assert.deepEqual(replacement.toggle.focusOptions, { preventScroll: true });
  }
});

test("repeated Review content toggles restore only their current snapshot", () => {
  const first = createHarness({ contentType: "history", scrollTop: 120 });
  const firstInteraction = captureReviewProductListInteraction({
    page: first.page,
    activeElement: first.toggle,
  });
  const second = createHarness({ contentType: "history", scrollTop: 0 });
  restoreReviewProductListInteraction(firstInteraction, { page: second.page });

  second.list.scrollTop = 360;
  const secondInteraction = captureReviewProductListInteraction({
    page: second.page,
    activeElement: second.toggle,
  });
  const third = createHarness({ contentType: "history", scrollTop: 0 });
  restoreReviewProductListInteraction(secondInteraction, { page: third.page });

  assert.equal(second.list.scrollTop, 360);
  assert.equal(second.toggle.focusCount, 1);
  assert.equal(third.list.scrollTop, 360);
  assert.equal(third.toggle.focusCount, 1);
});

function createHarness({ contentType, scrollTop }) {
  const toggle = {
    dataset: {
      reviewProductId: "product-8",
      reviewContentType: contentType,
    },
    focusCount: 0,
    focusOptions: null,
    focus(options) {
      this.focusCount += 1;
      this.focusOptions = options;
    },
  };
  const list = {
    clientHeight: 180,
    scrollHeight: 900,
    scrollTop,
    contains(element) {
      return element === toggle;
    },
    querySelectorAll() {
      return [toggle];
    },
  };
  const page = {
    querySelector(selector) {
      return selector === ".pc-review-product-list__items" ? list : null;
    },
  };

  return { list, page, toggle };
}
