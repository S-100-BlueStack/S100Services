import assert from "node:assert/strict";
import test from "node:test";

import {
  REVIEW_CONTENT_TYPES,
  addReviewProductItem,
  createReviewProductItems,
  getEnabledReviewContentTypes,
  getEnabledReviewDatasetNames,
  removeReviewProductItem,
  toggleReviewProductContentType,
  toggleReviewProductItem,
} from "./reviewProductList.js";

test("createReviewProductItems normalizes and deduplicates product names", () => {
  const items = createReviewProductItems([" 101DK001NORSO ", "", "101dk001norso", "101DK0021733C"]);

  assert.deepEqual(items, [
    {
      id: "101DK001NORSO",
      datasetName: "101DK001NORSO",
      enabled: true,
      contentTypes: {
        [REVIEW_CONTENT_TYPES.HISTORY]: true,
        [REVIEW_CONTENT_TYPES.IC_ENC_REPORTS]: false,
        [REVIEW_CONTENT_TYPES.INTERNAL_VALIDATION_REPORTS]: false,
      },
    },
    {
      id: "101DK0021733C",
      datasetName: "101DK0021733C",
      enabled: true,
      contentTypes: {
        [REVIEW_CONTENT_TYPES.HISTORY]: true,
        [REVIEW_CONTENT_TYPES.IC_ENC_REPORTS]: false,
        [REVIEW_CONTENT_TYPES.INTERNAL_VALIDATION_REPORTS]: false,
      },
    },
  ]);
});

test("addReviewProductItem adds a new product and re-enables an existing one", () => {
  const disabledItems = toggleReviewProductItem(
    createReviewProductItems(["101DK001NORSO"]),
    "101DK001NORSO",
    false
  );
  const nextItems = addReviewProductItem(disabledItems, "101dk001norso");
  const finalItems = addReviewProductItem(nextItems, "101DK0021733C");

  assert.deepEqual(getEnabledReviewDatasetNames(finalItems), ["101DK001NORSO", "101DK0021733C"]);
});

test("toggleReviewProductItem disables products without removing them", () => {
  const items = createReviewProductItems(["101DK001NORSO", "101DK0021733C"]);
  const nextItems = toggleReviewProductItem(items, "101DK001NORSO", false);

  assert.deepEqual(getEnabledReviewDatasetNames(nextItems), ["101DK0021733C"]);
  assert.equal(nextItems.length, 2);
});

test("toggleReviewProductContentType changes content selection without disabling product", () => {
  const items = createReviewProductItems(["101DK001NORSO"]);
  const withValidation = toggleReviewProductContentType(
    items,
    "101DK001NORSO",
    REVIEW_CONTENT_TYPES.INTERNAL_VALIDATION_REPORTS,
    true
  );
  const withoutHistory = toggleReviewProductContentType(
    withValidation,
    "101DK001NORSO",
    REVIEW_CONTENT_TYPES.HISTORY,
    false
  );

  assert.deepEqual(getEnabledReviewDatasetNames(withoutHistory), ["101DK001NORSO"]);
  assert.deepEqual(getEnabledReviewContentTypes(withoutHistory[0]), [
    REVIEW_CONTENT_TYPES.INTERNAL_VALIDATION_REPORTS,
  ]);
});

test("removeReviewProductItem removes products by id", () => {
  const items = createReviewProductItems(["101DK001NORSO", "101DK0021733C"]);
  const nextItems = removeReviewProductItem(items, "101DK001NORSO");

  assert.deepEqual(getEnabledReviewDatasetNames(nextItems), ["101DK0021733C"]);
});
