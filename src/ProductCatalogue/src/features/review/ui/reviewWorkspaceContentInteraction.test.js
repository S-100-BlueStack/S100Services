import assert from "node:assert/strict";
import test from "node:test";

import {
  captureReviewWorkspaceContentInteraction,
  restoreReviewWorkspaceContentInteraction,
} from "./reviewWorkspaceContentInteraction.js";

test("workspace content bulk toggles preserve Product-list scroll and their own focus", () => {
  for (const contentType of ["history", "ic-enc-reports", "internal-validation-reports"]) {
    const original = createHarness({ contentType, scrollTop: 540 });
    const interaction = captureReviewWorkspaceContentInteraction({
      page: original.page,
      activeElement: original.toggle,
    });
    const replacement = createHarness({ contentType, scrollTop: 0 });

    restoreReviewWorkspaceContentInteraction(interaction, { page: replacement.page });

    assert.equal(replacement.list.scrollTop, 540);
    assert.equal(replacement.toggle.focusCount, 1);
    assert.deepEqual(replacement.toggle.focusOptions, { preventScroll: true });
  }
});

function createHarness({ contentType, scrollTop }) {
  const toggle = {
    dataset: {
      reviewWorkspaceContentType: contentType,
    },
    focusCount: 0,
    focusOptions: null,
    focus(options) {
      this.focusCount += 1;
      this.focusOptions = options;
    },
  };
  const list = { scrollTop };
  const page = {
    querySelector(selector) {
      return selector === ".pc-review-product-list__items" ? list : null;
    },
    querySelectorAll(selector) {
      return selector === "[data-review-workspace-content-type]" ? [toggle] : [];
    },
  };

  return { list, page, toggle };
}
