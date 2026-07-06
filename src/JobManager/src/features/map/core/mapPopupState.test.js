import assert from "node:assert/strict";
import test from "node:test";

import {
  closePopupIfAggregate,
  isAggregatePopupFeature,
  isAggregatePopupOpen,
} from "./mapPopupState.js";

test("isAggregatePopupFeature detects ArcGIS aggregate graphics", () => {
  assert.equal(
    isAggregatePopupFeature({
      isAggregate: true,
    }),
    true
  );
});

test("isAggregatePopupFeature detects cluster_count popup graphics", () => {
  assert.equal(
    isAggregatePopupFeature({
      attributes: {
        cluster_count: 3,
      },
    }),
    true
  );
});

test("isAggregatePopupFeature detects cluster popup templates without relying only on selectedFeature.isAggregate", () => {
  assert.equal(
    isAggregatePopupFeature({
      popupTemplate: {
        title: "{cluster_count} Jobs in this cluster",
      },
    }),
    true
  );
});

test("isAggregatePopupFeature ignores normal Job graphics", () => {
  assert.equal(
    isAggregatePopupFeature({
      attributes: {
        jobId: "job-001",
        title: "Normal Job",
      },
      popupTemplate: {
        title: "{title}",
      },
    }),
    false
  );
});

test("isAggregatePopupOpen checks popup selectedFeature, viewModel selectedFeature and feature collections", () => {
  assert.equal(
    isAggregatePopupOpen({
      selectedFeature: null,
      viewModel: {
        selectedFeature: null,
        features: {
          toArray() {
            return [
              {
                attributes: {
                  title: "Normal Job",
                },
              },
              {
                attributes: {
                  cluster_count: 2,
                },
              },
            ];
          },
        },
      },
    }),
    true
  );
});

test("closePopupIfAggregate closes aggregate popups through view.closePopup when available", () => {
  let closeCount = 0;

  const result = closePopupIfAggregate({
    view: {
      popup: {
        viewModel: {
          selectedFeature: {
            attributes: {
              cluster_count: 4,
            },
          },
        },
      },
      closePopup() {
        closeCount += 1;
      },
    },
  });

  assert.equal(result, true);
  assert.equal(closeCount, 1);
});

test("closePopupIfAggregate falls back to popup.close", () => {
  let closeCount = 0;

  const result = closePopupIfAggregate({
    view: {
      popup: {
        selectedFeature: {
          isAggregate: true,
        },
        close() {
          closeCount += 1;
        },
      },
    },
  });

  assert.equal(result, true);
  assert.equal(closeCount, 1);
});

test("closePopupIfAggregate keeps normal Job popups open", () => {
  let closeCount = 0;

  const result = closePopupIfAggregate({
    view: {
      popup: {
        selectedFeature: {
          attributes: {
            jobId: "job-001",
          },
        },
        close() {
          closeCount += 1;
        },
      },
    },
  });

  assert.equal(result, false);
  assert.equal(closeCount, 0);
});
