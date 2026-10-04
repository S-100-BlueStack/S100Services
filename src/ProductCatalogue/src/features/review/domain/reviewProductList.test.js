import assert from "node:assert/strict";
import test from "node:test";

import {
  REVIEW_CONTENT_TYPES,
  addReviewProductItem,
  createReviewWorkspaceContentIntent,
  createReviewProductItems,
  getReviewContentTypeAggregateState,
  getEnabledReviewContentTypes,
  getEnabledReviewDatasetNames,
  removeReviewProductItem,
  toggleReviewProductContentType,
  toggleAllReviewProductContentTypes,
  toggleReviewProductItem,
  updateReviewWorkspaceContentIntent,
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
        [REVIEW_CONTENT_TYPES.IC_ENC_REPORTS]: true,
        [REVIEW_CONTENT_TYPES.INTERNAL_VALIDATION_REPORTS]: true,
      },
    },
    {
      id: "101DK0021733C",
      datasetName: "101DK0021733C",
      enabled: true,
      contentTypes: {
        [REVIEW_CONTENT_TYPES.HISTORY]: true,
        [REVIEW_CONTENT_TYPES.IC_ENC_REPORTS]: true,
        [REVIEW_CONTENT_TYPES.INTERNAL_VALIDATION_REPORTS]: true,
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
  const withoutValidation = toggleReviewProductContentType(
    items,
    "101DK001NORSO",
    REVIEW_CONTENT_TYPES.INTERNAL_VALIDATION_REPORTS,
    false
  );
  const withoutHistory = toggleReviewProductContentType(
    withoutValidation,
    "101DK001NORSO",
    REVIEW_CONTENT_TYPES.HISTORY,
    false
  );

  assert.deepEqual(getEnabledReviewDatasetNames(withoutHistory), ["101DK001NORSO"]);
  assert.deepEqual(getEnabledReviewContentTypes(withoutHistory[0]), [
    REVIEW_CONTENT_TYPES.IC_ENC_REPORTS,
  ]);
});

test("initial Review products enable every content type by default", () => {
  const items = createReviewProductItems(["101DK001NORSO", "101DK0021733C"]);
  const expectedContentTypes = [
    REVIEW_CONTENT_TYPES.HISTORY,
    REVIEW_CONTENT_TYPES.IC_ENC_REPORTS,
    REVIEW_CONTENT_TYPES.INTERNAL_VALIDATION_REPORTS,
  ];

  assert.deepEqual(
    items.map((item) => getEnabledReviewContentTypes(item)),
    [expectedContentTypes, expectedContentTypes]
  );
});

test("bulk actions update only the selected content type for every product", () => {
  const contentTypeIds = Object.values(REVIEW_CONTENT_TYPES);

  for (const contentTypeId of contentTypeIds) {
    const initialItems = createReviewProductItems(["101DK001NORSO", "101DK0021733C"]);
    const disabledItems = toggleAllReviewProductContentTypes(initialItems, contentTypeId, false);

    assert.equal(
      disabledItems.every((item) => item.contentTypes[contentTypeId] === false),
      true
    );
    for (const otherContentTypeId of contentTypeIds.filter((id) => id !== contentTypeId)) {
      assert.equal(
        disabledItems.every((item) => item.contentTypes[otherContentTypeId] === true),
        true
      );
    }

    const enabledItems = toggleAllReviewProductContentTypes(disabledItems, contentTypeId, true);
    assert.equal(
      enabledItems.every((item) => item.contentTypes[contentTypeId] === true),
      true
    );
  }
});

test("bulk content actions do not change Product enabled state", () => {
  const items = toggleReviewProductItem(
    createReviewProductItems(["101DK001NORSO", "101DK0021733C"]),
    "101DK001NORSO",
    false
  );
  const nextItems = toggleAllReviewProductContentTypes(items, REVIEW_CONTENT_TYPES.HISTORY, false);

  assert.deepEqual(
    nextItems.map((item) => item.enabled),
    [false, true]
  );
});

test("aggregate content state distinguishes enabled, disabled, mixed, and empty", () => {
  const enabledItems = createReviewProductItems(["101DK001NORSO", "101DK0021733C"]);
  const disabledItems = toggleAllReviewProductContentTypes(
    enabledItems,
    REVIEW_CONTENT_TYPES.HISTORY,
    false
  );
  const mixedItems = toggleReviewProductContentType(
    disabledItems,
    "101DK001NORSO",
    REVIEW_CONTENT_TYPES.HISTORY,
    true
  );

  assert.equal(
    getReviewContentTypeAggregateState(enabledItems, REVIEW_CONTENT_TYPES.HISTORY),
    "all-enabled"
  );
  assert.equal(
    getReviewContentTypeAggregateState(disabledItems, REVIEW_CONTENT_TYPES.HISTORY),
    "all-disabled"
  );
  assert.equal(
    getReviewContentTypeAggregateState(mixedItems, REVIEW_CONTENT_TYPES.HISTORY),
    "mixed"
  );
  assert.equal(getReviewContentTypeAggregateState([], REVIEW_CONTENT_TYPES.HISTORY), "empty");
});

test("individual overrides update aggregate state without changing workspace intent", () => {
  const intent = updateReviewWorkspaceContentIntent(
    createReviewWorkspaceContentIntent(),
    REVIEW_CONTENT_TYPES.HISTORY,
    false
  );
  const disabledItems = toggleAllReviewProductContentTypes(
    createReviewProductItems(["101DK001NORSO", "101DK0021733C"]),
    REVIEW_CONTENT_TYPES.HISTORY,
    false
  );
  const overriddenItems = toggleReviewProductContentType(
    disabledItems,
    "101DK001NORSO",
    REVIEW_CONTENT_TYPES.HISTORY,
    true
  );

  assert.equal(intent[REVIEW_CONTENT_TYPES.HISTORY], false);
  assert.equal(overriddenItems[0].contentTypes[REVIEW_CONTENT_TYPES.HISTORY], true);
  assert.equal(overriddenItems[1].contentTypes[REVIEW_CONTENT_TYPES.HISTORY], false);
  assert.equal(
    getReviewContentTypeAggregateState(overriddenItems, REVIEW_CONTENT_TYPES.HISTORY),
    "mixed"
  );
});

test("new products inherit each independent workspace content intent", () => {
  const contentTypeIds = Object.values(REVIEW_CONTENT_TYPES);

  for (const contentTypeId of contentTypeIds) {
    const initialIntent = createReviewWorkspaceContentIntent();
    const initialItems = addReviewProductItem([], "101DK001NORSO", {
      contentTypeIntent: initialIntent,
    });
    assert.equal(initialItems[0].contentTypes[contentTypeId], true);

    const offIntent = updateReviewWorkspaceContentIntent(initialIntent, contentTypeId, false);
    const allOff = toggleAllReviewProductContentTypes(initialItems, contentTypeId, false);
    const withIndividualOn = toggleReviewProductContentType(
      allOff,
      "101DK001NORSO",
      contentTypeId,
      true
    );
    const addedAfterOff = addReviewProductItem(withIndividualOn, "101DK0021733C", {
      contentTypeIntent: offIntent,
    });
    assert.equal(addedAfterOff[0].contentTypes[contentTypeId], true);
    assert.equal(addedAfterOff[1].contentTypes[contentTypeId], false);

    const onIntent = updateReviewWorkspaceContentIntent(offIntent, contentTypeId, true);
    const allOn = toggleAllReviewProductContentTypes(addedAfterOff, contentTypeId, true);
    const withIndividualOff = toggleReviewProductContentType(
      allOn,
      "101DK001NORSO",
      contentTypeId,
      false
    );
    const addedAfterOn = addReviewProductItem(withIndividualOff, "101DK0030000", {
      contentTypeIntent: onIntent,
    });
    assert.equal(addedAfterOn[0].contentTypes[contentTypeId], false);
    assert.equal(addedAfterOn[2].contentTypes[contentTypeId], true);
  }
});

test("normalization preserves content selection through refresh reconciliation", () => {
  const initialItems = createReviewProductItems(["101DK001NORSO", "101DK0021733C"]);
  const customizedItems = toggleReviewProductContentType(
    toggleReviewProductContentType(
      initialItems,
      "101DK001NORSO",
      REVIEW_CONTENT_TYPES.HISTORY,
      false
    ),
    "101DK0021733C",
    REVIEW_CONTENT_TYPES.INTERNAL_VALIDATION_REPORTS,
    false
  );

  assert.deepEqual(createReviewProductItems(customizedItems), customizedItems);
});

test("removeReviewProductItem removes products by id", () => {
  const items = createReviewProductItems(["101DK001NORSO", "101DK0021733C"]);
  const nextItems = removeReviewProductItem(items, "101DK001NORSO");

  assert.deepEqual(getEnabledReviewDatasetNames(nextItems), ["101DK0021733C"]);
});
