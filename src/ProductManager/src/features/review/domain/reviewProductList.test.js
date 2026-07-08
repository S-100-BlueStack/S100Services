import assert from "node:assert/strict";
import test from "node:test";

import {
  addReviewProductItem,
  createReviewProductItems,
  getEnabledReviewDatasetNames,
  removeReviewProductItem,
  toggleReviewProductItem,
} from "./reviewProductList.js";

test("createReviewProductItems normalizes and deduplicates product names", () => {
  const items = createReviewProductItems([" 101DK001NORSO ", "", "101dk001norso", "101DK0021733C"]);

  assert.deepEqual(items, [
    {
      id: "101DK001NORSO",
      datasetName: "101DK001NORSO",
      enabled: true,
    },
    {
      id: "101DK0021733C",
      datasetName: "101DK0021733C",
      enabled: true,
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

test("removeReviewProductItem removes products by id", () => {
  const items = createReviewProductItems(["101DK001NORSO", "101DK0021733C"]);
  const nextItems = removeReviewProductItem(items, "101DK001NORSO");

  assert.deepEqual(getEnabledReviewDatasetNames(nextItems), ["101DK0021733C"]);
});
